/**
 * Message grouping — groups messages by API round-trip boundaries.
 * This enables fine-grained compaction: instead of discarding whole
 * "human turns", we can drop individual API round groups.
 *
 * Ported from Claude Code's grouping.ts concept.
 */

import type { Message } from '../../tool/Tool.js';

// ─── Token Estimation ───

/**
 * Estimate tokens from text (chars / 3.5, conservative).
 */
export function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate tokens for a single message.
 */
function estimateMessageTokens(msg: Message): number {
  let total = 0;
  for (const block of msg.content) {
    if (block.type === 'text') total += roughTokenCount(block.text);
    else if (block.type === 'tool_use') {
      total += roughTokenCount(block.name + JSON.stringify(block.input ?? {}));
    } else if (block.type === 'tool_result') {
      for (const tc of block.content) {
        if (tc.type === 'text') total += roughTokenCount(tc.text);
        else total += 2000; // image/document
      }
    } else if (block.type === 'thinking') {
      total += roughTokenCount(block.thinking);
    }
  }
  return total;
}

/**
 * Estimate tokens for a batch of messages.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

/**
 * Count tool calls across messages.
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
 * Build a compact progress message (for UI display).
 */
export function getCompactProgressMessage(messages: Message[]): string {
  const tokenEstimate = estimateMessagesTokens(messages);
  const toolCallCount = countToolCalls(messages);
  return `Context: ~${tokenEstimate.toLocaleString()} tokens, ${messages.length} messages, ${toolCallCount} tool calls`;
}

// ─── Message Grouping ───

/**
 * Group messages by API round-trip boundaries.
 *
 * Each assistant message.id change marks a new API round boundary.
 * This is finer-grained than human-turn grouping — a single user prompt
 * may trigger multiple API rounds in an agentic loop.
 */
export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];
  let lastAssistantId: string | undefined;

  for (const msg of messages) {
    const isNewAssistant =
      msg.role === 'assistant' &&
      (msg as any).messageId !== lastAssistantId &&
      current.length > 0;

    if (isNewAssistant) {
      groups.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }

    if (msg.role === 'assistant' && (msg as any).messageId) {
      lastAssistantId = (msg as any).messageId;
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

/**
 * Build a boundary message marking where compaction happened.
 */
export function createCompactBoundaryMessage(
  trigger: 'auto' | 'manual',
  preCompactTokens: number,
  lastUuid?: string,
  hasPreservedMessages?: boolean,
): Message {
  return {
    role: 'assistant',
    content: [{
      type: 'text',
      text: `<compact_boundary trigger="${trigger}" pre_compact_tokens="${preCompactTokens}"${hasPreservedMessages ? ' has_preserved_messages="true"' : ''} />`,
    }],
  };
}
