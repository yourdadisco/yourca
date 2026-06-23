/**
 * Context compaction service — ported from Claude Code's compression system.
 * Manages context window by:
 * - Compacting old messages when approaching token limits
 * - Creating summary messages
 * - Preserving recent messages
 */

import type { Message, Content } from '../tool/Tool.js';

// Token budget for various models (conservative estimates)
const TOKEN_BUDGETS: Record<string, number> = {
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,
  'deepseek-coder': 128_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-3.5-sonnet': 200_000,
  'claude-3-opus': 200_000,
  'gpt-4': 128_000,
  'gpt-4o': 128_000,
  'default': 128_000,
};

const MAX_COMPACT_TRIGGER_RATIO = 0.85; // Compact when at 85% of budget
const MIN_MESSAGES_TO_KEEP = 6; // Always keep last N messages
const COMPACT_BUFFER = 10_000; // Token buffer after compaction

/**
 * Rough token estimation (chars / 4).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5); // Slightly more conservative
}

/**
 * Estimate total tokens for a message list.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    for (const c of msg.content) {
      if (c.type === 'text') total += estimateTokens(c.text);
    }
  }
  return total;
}

/**
 * Count the number of tool calls in messages.
 */
export function countToolCalls(messages: Message[]): number {
  return messages.reduce((count, msg) => {
    if (msg.role === 'assistant') {
      return count + msg.content.filter(c => c.type === 'tool_use').length;
    }
    return count;
  }, 0);
}

/**
 * Get token budget for the current model.
 */
export function getTokenBudget(model: string): number {
  return TOKEN_BUDGETS[model] ?? TOKEN_BUDGETS['default'];
}

/**
 * Check if compaction is needed.
 */
export function shouldCompact(messages: Message[], model: string): boolean {
  const budget = getTokenBudget(model);
  const current = estimateMessagesTokens(messages);
  return current > budget * MAX_COMPACT_TRIGGER_RATIO;
}

/**
 * Perform context compaction.
 * Creates a summary of older messages and keeps recent ones intact.
 */
export function compactMessages(messages: Message[], model: string): Message[] {
  if (messages.length <= MIN_MESSAGES_TO_KEEP) return messages;

  const budget = getTokenBudget(model);
  const targetSize = budget - COMPACT_BUFFER;
  const currentSize = estimateMessagesTokens(messages);

  // How many messages to keep at the end
  const keepCount = Math.min(MIN_MESSAGES_TO_KEEP, messages.length - 1);

  // Messages we'll preserve
  const preserved = messages.slice(-keepCount);
  const preservedSize = estimateMessagesTokens(preserved);

  // How much space for the summary
  const summaryBudget = targetSize - preservedSize;
  if (summaryBudget <= 0) {
    // Extreme case — just keep the last few messages
    return preserved;
  }

  // Messages to compact
  const toCompact = messages.slice(0, -keepCount);
  const compactStats = {
    totalMessages: toCompact.length,
    toolCalls: countToolCalls(toCompact),
    estimatedTokens: estimateMessagesTokens(toCompact),
  };

  // Build compact summary
  const summaryText = [
    `<system>`,
    `[Previous conversation context has been compacted.]`,
    `Compacted ${compactStats.totalMessages} messages with ${compactStats.toolCalls} tool calls (approximately ${compactStats.estimatedTokens} tokens).`,
    `The conversation up to this point was summarized to save context window space.`,
    `If you need details from the compacted portion, ask the user to provide them.`,
    `</system>`,
  ].join('\n');

  // Ensure summary fits within budget
  const summaryContent: Content = { type: 'text', text: summaryText.slice(0, summaryBudget) };

  return [
    { role: 'assistant', content: [summaryContent] },
    { role: 'user', content: [{ type: 'text', text: '[Continuing after compaction...]' }] },
    ...preserved,
  ];
}

/**
 * Generate a compact progress message.
 */
export function getCompactProgressMessage(messages: Message[]): string {
  const tokenEstimate = estimateMessagesTokens(messages);
  const toolCallCount = countToolCalls(messages);
  return `Context: ~${tokenEstimate.toLocaleString()} tokens, ${messages.length} messages, ${toolCallCount} tool calls`;
}
