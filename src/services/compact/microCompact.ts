/**
 * L1: MicroCompact — rule-based token reduction with ZERO LLM calls.
 *
 * Strategies:
 * 1. Cached-aware deletion: strip tool results from compactable tools
 * 2. Time-based clearing: if the gap since last assistant is large,
 *    the server cache is cold — clear old tool results to shrink the prompt.
 *
 * Ported from Claude Code's microCompact.ts concepts.
 */

import type { Message, Content } from '../../tool/Tool.js';
import { estimateMessagesTokens } from './grouping.js';

// Tools whose results are safe to strip during micro-compact
const COMPACTABLE_TOOLS = new Set([
  'Read', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'Edit', 'Write',
]);

// Content replaced when clearing old tool results
const CLEARED_MESSAGE = '[Tool result content cleared by micro-compact]';

const TIME_BASED_GAP_MINUTES = 15;
const TIME_BASED_KEEP_RECENT = 3;

// ─── Time-based Trigger ───

export interface TimeBasedTrigger {
  gapMinutes: number;
  keepRecent: number;
}

/**
 * Check whether the time-based micro-compact trigger should fire.
 */
export function evaluateTimeBasedTrigger(
  messages: Message[],
  querySource?: string,
): TimeBasedTrigger | null {
  if (querySource && querySource !== 'repl_main_thread') return null;

  // Find last assistant message
  let lastAssistant: Message | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      lastAssistant = messages[i];
      break;
    }
  }
  if (!lastAssistant) return null;

  // Check if message has timestamp — if not, can't do time-based
  const ts = (lastAssistant as any).timestamp;
  if (!ts) return null;

  const gapMinutes = (Date.now() - new Date(ts).getTime()) / 60_000;
  if (!Number.isFinite(gapMinutes) || gapMinutes < TIME_BASED_GAP_MINUTES) return null;

  return { gapMinutes, keepRecent: TIME_BASED_KEEP_RECENT };
}

// ─── MicroCompact Result ───

export interface MicroCompactResult {
  messages: Message[];
  tokensSaved: number;
  toolResultsCleared: number;
  trigger: 'cached' | 'time_based' | 'none';
}

/**
 * Collect tool_use IDs from compactable tools, in encounter order.
 */
function collectCompactableToolIds(messages: Message[]): string[] {
  const ids: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && COMPACTABLE_TOOLS.has(block.name)) {
          ids.push(block.id);
        }
      }
    }
  }
  return ids;
}

/**
 * Time-based micro-compact: clear old tool result content when
 * the gap since last assistant message exceeds threshold.
 */
function timeBasedMicroCompact(messages: Message[]): MicroCompactResult {
  const compactableIds = collectCompactableToolIds(messages);
  if (compactableIds.length === 0) {
    return { messages, tokensSaved: 0, toolResultsCleared: 0, trigger: 'none' };
  }

  const keepCount = Math.max(1, TIME_BASED_KEEP_RECENT);
  const keepSet = new Set(compactableIds.slice(-keepCount));
  const clearSet = new Set(compactableIds.filter(id => !keepSet.has(id)));

  if (clearSet.size === 0) {
    return { messages, tokensSaved: 0, toolResultsCleared: 0, trigger: 'none' };
  }

  let tokensSaved = 0;
  let toolResultsCleared = 0;
  const result: Message[] = messages.map(msg => {
    if (msg.role !== 'user') return msg;
    let touched = false;
    const newContent = msg.content.map(block => {
      if (
        block.type === 'tool_result' &&
        clearSet.has(block.tool_use_id) &&
        !block.content.some(c => c.type === 'text' && c.text === CLEARED_MESSAGE)
      ) {
        for (const tc of block.content) {
          if (tc.type === 'text') tokensSaved += Math.ceil(tc.text.length / 3.5);
          else tokensSaved += 2000;
        }
        toolResultsCleared++;
        touched = true;
        return { ...block, content: [{ type: 'text' as const, text: CLEARED_MESSAGE }] };
      }
      return block;
    });
    if (!touched) return msg;
    return { ...msg, content: newContent };
  });

  return {
    messages: result,
    tokensSaved,
    toolResultsCleared,
    trigger: 'time_based',
  };
}

/**
 * Cached-aware micro-compact: strip compactable tool results.
 */
function cachedAwareMicroCompact(messages: Message[]): MicroCompactResult {
  const compactableIds = collectCompactableToolIds(messages);
  if (compactableIds.length === 0) {
    return { messages, tokensSaved: 0, toolResultsCleared: 0, trigger: 'none' };
  }

  // Find tool_use IDs that have corresponding tool_results
  const toolResultIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'user') {
      for (const block of msg.content) {
        if (block.type === 'tool_result' && compactableIds.includes(block.tool_use_id)) {
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }

  if (toolResultIds.size === 0) {
    return { messages, tokensSaved: 0, toolResultsCleared: 0, trigger: 'none' };
  }

  let tokensSaved = 0;
  let toolResultsCleared = 0;
  const result: Message[] = messages.map(msg => {
    if (msg.role !== 'user') return msg;
    let touched = false;
    const newContent = msg.content.map(block => {
      if (
        block.type === 'tool_result' &&
        toolResultIds.has(block.tool_use_id)
      ) {
        for (const tc of block.content) {
          if (tc.type === 'text') tokensSaved += Math.ceil(tc.text.length / 3.5);
          else tokensSaved += 2000;
        }
        toolResultsCleared++;
        touched = true;
        return { ...block, content: [{ type: 'text' as const, text: CLEARED_MESSAGE }] };
      }
      return block;
    });
    if (!touched) return msg;
    return { ...msg, content: newContent };
  });

  return {
    messages: result,
    tokensSaved,
    toolResultsCleared,
    trigger: 'cached',
  };
}

/**
 * Run micro-compact on messages.
 * Tries time-based first (cache is cold anyway), then cached-aware.
 */
export function microcompactMessages(
  messages: Message[],
  querySource?: string,
): MicroCompactResult {
  // Time-based trigger first
  const trigger = evaluateTimeBasedTrigger(messages, querySource);
  if (trigger) {
    const result = timeBasedMicroCompact(messages);
    if (result.toolResultsCleared > 0) return result;
  }

  // Cached-aware micro-compact
  return cachedAwareMicroCompact(messages);
}

/**
 * Strip image/document blocks from messages.
 */
export function stripMediaFromMessages(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (msg.role !== 'user') return msg;
    let hasMedia = false;
    const newContent = msg.content.flatMap(block => {
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        let toolHasMedia = false;
        const newToolContent = block.content.map(item => {
          if (item.type === 'image') {
            toolHasMedia = true;
            return { type: 'text' as const, text: '[image]' };
          }
          // Handle document type (present in ToolResultContent as base64 source)
          if ((item as any).type === 'document') {
            toolHasMedia = true;
            return { type: 'text' as const, text: '[document]' };
          }
          return item;
        });
        if (toolHasMedia) {
          hasMedia = true;
          return [{ ...block, content: newToolContent }];
        }
      }
      return [block];
    });
    if (!hasMedia) return msg;
    return { ...msg, content: newContent };
  });
}
