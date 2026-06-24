/**
 * AutoCompact — the coordination layer that decides WHEN to compact
 * and WHICH layer (L1-L4) to use based on context pressure.
 *
 * Flow:
 *   Each turn → shouldAutoCompact()?
 *     YES → trySessionMemoryCompact()  (L2, zero API cost)
 *              ↓ fail
 *            classicCompactConversation()  (L3, LLM summary)
 *              ↓ PTL
 *            reactiveCompactConversation() (L4, emergency)
 *     NO  → microcompactMessages() (L1, zero LLM, every turn)
 *
 * Ported from Claude Code's autoCompact.ts.
 */

import type { Message } from '../../tool/Tool.js';
import type { CompactionResult, AutoCompactState, CompactConfig } from './types.js';
import { DEFAULT_COMPACT_CONFIG } from './types.js';
import { estimateMessagesTokens } from './grouping.js';
import { getSessionMemoryContent, isSessionMemoryEmpty, buildSessionMemorySummaryMessage } from './sessionMemory.js';
import { classicCompactConversation, type CompactCallConfig } from './classicCompact.js';
import { reactiveCompactConversation } from './reactiveCompact.js';

// ─── Config ───

let compactConfig: CompactConfig = { ...DEFAULT_COMPACT_CONFIG };

export function setCompactConfig(cfg: Partial<CompactConfig>): void {
  compactConfig = { ...compactConfig, ...cfg };
}

export function getCompactConfig(): CompactConfig {
  return { ...compactConfig };
}

// ─── Token Budget ───

export function getEffectiveContextWindow(model: string): number {
  const window = compactConfig.modelContextWindows[model] ?? compactConfig.modelContextWindows['default']!;
  return window - compactConfig.outputBufferTokens;
}

export function getAutoCompactThreshold(model: string): number {
  const effective = getEffectiveContextWindow(model);
  return Math.floor(effective * compactConfig.autoCompactRatio);
}

// ─── AutoCompact State ───

let state: AutoCompactState = {
  compacted: false,
  turnCounter: 0,
  turnId: '',
  consecutiveFailures: 0, // always initialized
};

export function getAutoCompactState(): AutoCompactState {
  return { ...state };
}

export function resetAutoCompactState(): void {
  state = { compacted: false, turnCounter: 0, turnId: Date.now().toString(36), consecutiveFailures: 0 };
}

// ─── Token Warning State ───

export function calculateTokenWarningState(tokenUsage: number, model: string) {
  const threshold = getAutoCompactThreshold(model);
  const percentLeft = Math.max(0, Math.round(((threshold - tokenUsage) / threshold) * 100));
  return {
    percentLeft,
    isAboveWarningThreshold: tokenUsage >= threshold - compactConfig.warningThresholdBuffer,
    isAboveAutoCompactThreshold: tokenUsage >= threshold,
    isAtBlockingLimit: tokenUsage >= getEffectiveContextWindow(model) - 3_000,
  };
}

// ─── Should Compact ───

export function shouldAutoCompact(messages: Message[], model: string, querySource?: string): boolean {
  if (querySource === 'session_memory' || querySource === 'compact') return false;
  const { isAboveAutoCompactThreshold } = calculateTokenWarningState(estimateMessagesTokens(messages), model);
  return isAboveAutoCompactThreshold;
}

// ─── Try Session Memory Compact (L2) ───

async function trySessionMemoryCompact(
  messages: Message[],
  preservedCount: number,
): Promise<CompactionResult | null> {
  const sessionMemory = getSessionMemoryContent();
  if (isSessionMemoryEmpty()) return null;

  const preCompactTokenCount = estimateMessagesTokens(messages);
  const summaryText = buildSessionMemorySummaryMessage(sessionMemory, preservedCount);

  return {
    boundaryMarker: {
      role: 'assistant',
      content: [{
        type: 'text',
        text: `<compact_boundary trigger="session_memory" pre_compact_tokens="${preCompactTokenCount}" />`,
      }],
    },
    summaryMessages: [{ role: 'user', content: [{ type: 'text', text: summaryText }] }],
    messagesToKeep: messages.slice(-preservedCount),
    preCompactTokenCount,
    postCompactTokenCount: estimateMessagesTokens([{ role: 'user', content: [{ type: 'text', text: summaryText }] }] as Message[]),
    attachments: [],
  };
}

// ─── Build Post-Compact Messages ───

export function buildPostCompactMessages(result: CompactionResult): Message[] {
  return [
    result.boundaryMarker,
    ...result.summaryMessages,
    ...result.messagesToKeep,
    ...result.attachments,
  ];
}

// ─── Main AutoCompact ───

export interface AutoCompactResult {
  wasCompacted: boolean;
  compactionResult?: CompactionResult;
  consecutiveFailures?: number;
}

export async function autoCompactIfNeeded(
  messages: Message[],
  model: string,
  config: Omit<CompactCallConfig, 'model'> & { querySource?: string },
): Promise<AutoCompactResult> {
  // Circuit breaker
  if (state.consecutiveFailures >= compactConfig.maxConsecutiveFailures) {
    return { wasCompacted: false };
  }

  if (!shouldAutoCompact(messages, model, config.querySource)) {
    return { wasCompacted: false };
  }

  const preservedCount = Math.min(10, Math.max(5, Math.floor(messages.length * 0.15)));

  // L2: Session memory compact
  try {
    const smResult = await trySessionMemoryCompact(messages, preservedCount);
    if (smResult) {
      state.consecutiveFailures = 0;
      state.compacted = true;
      return { wasCompacted: true, compactionResult: smResult };
    }
  } catch { /* fall through */ }

  // L3: Classic compact
  try {
    const callConfig: CompactCallConfig = {
      model,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      abortSignal: config.abortSignal,
      onStreamText: config.onStreamText,
      suppressFollowUpQuestions: true,
    };
    const result = await classicCompactConversation(messages, callConfig);
    state.consecutiveFailures = 0;
    state.compacted = true;
    return { wasCompacted: true, compactionResult: result };
  } catch (err) {
    // L4: Reactive compact
    try {
      const reactiveConfig: CompactCallConfig = {
        model,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        abortSignal: config.abortSignal,
        onStreamText: config.onStreamText,
        suppressFollowUpQuestions: true,
      };
      const result = await reactiveCompactConversation(messages, reactiveConfig);
      state.consecutiveFailures = 0;
      state.compacted = true;
      return { wasCompacted: true, compactionResult: result };
    } catch {
      state.consecutiveFailures += 1;
      return { wasCompacted: false, consecutiveFailures: state.consecutiveFailures };
    }
  }
}
