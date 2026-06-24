/**
 * L3: Classic Compact — LLM-powered conversation summarization.
 *
 * Called when L1 (MicroCompact) and L2 (SessionMemory) can't handle the
 * context pressure. Sends older messages to a no-tools LLM call with
 * a structured prompt, then returns a CompactionResult.
 *
 * Ported from Claude Code's compactConversation() concepts.
 */

import type { Message } from '../../tool/Tool.js';
import type { CompactionResult } from './types.js';
import { estimateMessagesTokens, groupMessagesByApiRound, createCompactBoundaryMessage, countToolCalls } from './grouping.js';
import { stripMediaFromMessages } from './microCompact.js';
import { getCompactPrompt, getCompactUserSummaryMessage } from './prompt.js';

const MAX_OUTPUT_TOKENS = 20_000;
const MAX_PTL_RETRIES = 3;

export const ERROR_NOT_ENOUGH_MESSAGES = 'Not enough messages to compact.';
export const ERROR_PROMPT_TOO_LONG = 'Conversation too long. Try compacting earlier.';
export const ERROR_INCOMPLETE_RESPONSE = 'Compaction interrupted — please try again.';

// ─── Compact Call Config ───

export interface CompactCallConfig {
  model: string;
  systemPrompt: string;
  tools: ReadonlyArray<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  abortSignal?: AbortSignal;
  onStreamText?: (text: string) => void;
  customInstructions?: string;
  suppressFollowUpQuestions?: boolean;
}

// ─── PTL Retry Helper ───

function truncateForPtlRetry(messages: Message[], _ptlMessage: string): Message[] | null {
  const groups = groupMessagesByApiRound(messages);
  if (groups.length < 2) return null;

  // Drop ~30% of oldest groups
  const dropCount = Math.max(1, Math.floor(groups.length * 0.3));
  const sliced = groups.slice(dropCount).flat();

  if (sliced[0]?.role === 'assistant') {
    return [
      { role: 'user', content: [{ type: 'text', text: '[Earlier conversation truncated for compact retry]' }] },
      ...sliced,
    ];
  }
  return sliced;
}

// ─── Stream Compact Summary ───

async function streamCompactSummary(
  messagesToSummarize: Message[],
  config: CompactCallConfig,
): Promise<string> {
  const compactPrompt = getCompactPrompt(config.customInstructions);

  const apiMessages = [
    ...messagesToSummarize.map(m => ({
      role: m.role,
      content: m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') || null,
    })),
    { role: 'user' as const, content: compactPrompt },
  ];

  // Use minimal tools (just FileRead for reading transcript if needed)
  const toolsWithRead = config.tools
    .filter(t => t.name === 'FileRead')
    .map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));

  const { streamChatCompletion } = await import('../../query/api.js');
  const result = await streamChatCompletion(
    'You are a helpful AI assistant tasked with summarizing conversations.',
    apiMessages,
    toolsWithRead,
    { model: config.model, maxTokens: MAX_OUTPUT_TOKENS, signal: config.abortSignal },
  );

  let summary = '';
  for (const chunk of result.chunks) {
    if (chunk.type === 'text' && chunk.text) {
      summary += chunk.text;
      config.onStreamText?.(chunk.text);
    }
  }

  return summary;
}

// ─── Main Entry Point ───

export async function classicCompactConversation(
  messages: Message[],
  config: CompactCallConfig,
): Promise<CompactionResult> {
  if (messages.length <= 2) {
    throw new Error(ERROR_NOT_ENOUGH_MESSAGES);
  }

  const preCompactTokenCount = estimateMessagesTokens(messages);
  let messagesToSummarize = stripMediaFromMessages(messages);
  let summary: string | null = null;
  let ptlAttempts = 0;

  while (summary === null) {
    try {
      summary = await streamCompactSummary(messagesToSummarize, config);
    } catch (err: any) {
      const msg = err.message || '';
      const isPTL = msg.includes('prompt_too_long') || msg.includes('too long') ||
                    msg.includes('too many tokens') || msg.includes('413');

      if (isPTL) {
        ptlAttempts++;
        if (ptlAttempts > MAX_PTL_RETRIES) throw new Error(ERROR_PROMPT_TOO_LONG);
        const truncated = truncateForPtlRetry(messagesToSummarize, msg);
        if (!truncated) throw new Error(ERROR_PROMPT_TOO_LONG);
        messagesToSummarize = truncated;
        continue;
      }
      throw err;
    }
  }

  if (!summary || summary.length === 0) {
    throw new Error(ERROR_INCOMPLETE_RESPONSE);
  }

  const boundaryMarker = createCompactBoundaryMessage('manual', preCompactTokenCount);
  const summaryMessages: Message[] = [{
    role: 'user',
    content: [{
      type: 'text',
      text: getCompactUserSummaryMessage(summary, config.suppressFollowUpQuestions ?? true),
    }],
  }];

  return {
    boundaryMarker,
    summaryMessages,
    messagesToKeep: [],
    preCompactTokenCount,
    postCompactTokenCount: estimateMessagesTokens(summaryMessages),
    attachments: [],
  };
}
