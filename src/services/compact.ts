/**
 * Context compaction service — delegate to the new layered compact system.
 *
 * This file maintains backward compatibility. The actual implementation
 * lives in src/services/compact/ with a 4-layer architecture:
 *   L1: microCompact (rule-based)
 *   L2: sessionMemory (background extraction)
 *   L3: classicCompact (LLM summarization)
 *   L4: reactiveCompact (PTL emergency)
 *
 * See src/services/compact/index.ts for the full API.
 */

export {
  estimateMessagesTokens,
  countToolCalls,
  shouldAutoCompact as shouldCompact,
  autoCompactIfNeeded as compactMessages,
  getAutoCompactThreshold as getTokenBudget,
  calculateTokenWarningState,
  buildPostCompactMessages,
  microcompactMessages,
  getCompactConfig,
  setCompactConfig,
} from './compact/index.js';

export { getCompactProgressMessage } from './compact/grouping.js';

export type { CompactionResult, CompactConfig } from './compact/types.js';
