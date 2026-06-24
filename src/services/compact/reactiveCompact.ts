/**
 * L4: Reactive Compact — emergency handling when API returns prompt-too-long (PTL).
 *
 * Last line of defense. When L1-L3 can't prevent context overflow:
 * 1. Strip media first (cheapest)
 * 2. Run aggressive micro-compact
 * 3. Drop oldest API-round groups
 * 4. If session memory available, use as summary
 * 5. Last resort: drop oldest 50% and retry classic compact
 *
 * Ported from Claude Code's reactiveCompact.ts pattern.
 */

import type { Message } from '../../tool/Tool.js';
import type { CompactionResult } from './types.js';
import { estimateMessagesTokens, groupMessagesByApiRound, createCompactBoundaryMessage } from './grouping.js';
import { microcompactMessages, stripMediaFromMessages } from './microCompact.js';
import { getSessionMemoryContent, isSessionMemoryEmpty, buildSessionMemorySummaryMessage } from './sessionMemory.js';
import { classicCompactConversation, type CompactCallConfig } from './classicCompact.js';

export function isPromptTooLongError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('prompt_too_long') || msg.includes('too large') ||
         msg.includes('maximum context length') || msg.includes('context length exceeded') ||
         msg.includes('request too large') || msg.includes('413') ||
         (error as any)?.status === 413;
}

/**
 * Aggressively trim messages to fit within target tokens.
 */
export function handlePromptTooLong(
  messages: Message[],
  targetTokens: number,
): Message[] {
  let working = [...messages];

  // Step 1: Strip media
  working = stripMediaFromMessages(working);
  if (estimateMessagesTokens(working) <= targetTokens) return working;

  // Step 2: Micro-compact
  const mcResult = microcompactMessages(working);
  working = mcResult.messages;
  if (estimateMessagesTokens(working) <= targetTokens) return working;

  // Step 3: Drop oldest groups
  const groups = groupMessagesByApiRound(working);
  if (groups.length <= 1) return working;

  for (let dropCount = 1; dropCount < groups.length; dropCount++) {
    const sliced = groups.slice(dropCount).flat();
    if (estimateMessagesTokens(sliced) <= targetTokens) {
      if (sliced[0]?.role === 'assistant') {
        return [{ role: 'user', content: [{ type: 'text', text: '[Context trimmed due to length]' }] }, ...sliced];
      }
      return sliced;
    }
  }

  // Last resort: keep last 2 groups
  const last = groups.slice(-2).flat();
  return [{ role: 'user', content: [{ type: 'text', text: '[Context trimmed to essential messages]' }] }, ...last];
}

export async function reactiveCompactConversation(
  messages: Message[],
  config: CompactCallConfig,
): Promise<CompactionResult> {
  const preCompactTokenCount = estimateMessagesTokens(messages);

  // First try: session memory as summary (if available)
  const sessionMemory = getSessionMemoryContent();
  if (sessionMemory.trim() !== '' && !isSessionMemoryEmpty()) {
    return {
      boundaryMarker: createCompactBoundaryMessage('auto', preCompactTokenCount),
      summaryMessages: [{
        role: 'user',
        content: [{ type: 'text', text: buildSessionMemorySummaryMessage(sessionMemory, 0) }],
      }],
      messagesToKeep: [],
      preCompactTokenCount,
      postCompactTokenCount: estimateMessagesTokens([{ role: 'user', content: [{ type: 'text', text: '' }] }] as Message[]),
      attachments: [],
    };
  }

  // Fallback: aggressively trim and retry classic compact
  const effectiveContext = estimateMessagesTokens(messages);
  const target = Math.floor(effectiveContext * 0.4);
  const trimmed = handlePromptTooLong(messages, target);

  return await classicCompactConversation(trimmed, config);
}
