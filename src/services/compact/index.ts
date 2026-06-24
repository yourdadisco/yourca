/**
 * Compact System — layered context compression.
 *
 * Architecture:
 *   L1: MicroCompact  → rule-based tool result stripping, zero LLM, every turn
 *   L2: SessionMemory → background extraction, zero API at compact time
 *   L3: ClassicCompact → LLM summarization with structured prompt
 *   L4: ReactiveCompact → emergency PTL handling
 *
 * Exports the unified API used by QueryEngine and REPL.
 */

export { DEFAULT_COMPACT_CONFIG, type CompactConfig, type AutoCompactState, type CompactionResult } from './types.js';
export { estimateMessagesTokens, countToolCalls, groupMessagesByApiRound, createCompactBoundaryMessage } from './grouping.js';
export { microcompactMessages, stripMediaFromMessages } from './microCompact.js';
export {
  getSessionMemoryContent,
  writeSessionMemoryContent,
  isSessionMemoryEmpty,
  isSessionMemoryInitialized,
  shouldExtractMemory,
  buildExtractionPrompt,
  buildSessionMemorySummaryMessage,
  waitForSessionMemoryExtraction,
  truncateSessionMemoryForCompact,
  DEFAULT_TEMPLATE,
} from './sessionMemory.js';
export { classicCompactConversation, ERROR_NOT_ENOUGH_MESSAGES, ERROR_PROMPT_TOO_LONG } from './classicCompact.js';
export { reactiveCompactConversation, handlePromptTooLong, isPromptTooLongError } from './reactiveCompact.js';
export {
  autoCompactIfNeeded,
  shouldAutoCompact,
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEffectiveContextWindow,
  buildPostCompactMessages,
  setCompactConfig,
  getCompactConfig,
  resetAutoCompactState,
  getAutoCompactState,
  type AutoCompactResult,
} from './autoCompact.js';
export { getCompactPrompt, getPartialCompactPrompt, getCompactUserSummaryMessage, formatCompactSummary } from './prompt.js';
