/**
 * Compact system type extensions — extends base Message types for compaction.
 * All exported functions accept and return standard Message types.
 */

import type { Message } from '../../tool/Tool.js';

// ─── Internal extended type (optional extra fields) ───

export interface ExtendedMessage extends Message {
  uuid?: string;
  messageId?: string;
  timestamp?: string;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
}

// ─── Group ───

export interface MessageGroup {
  messages: ExtendedMessage[];
  estimatedTokens: number;
}

// ─── Compact Result (messages are standard Message[] type) ───

export interface CompactionResult {
  boundaryMarker: Message;
  summaryMessages: Message[];
  messagesToKeep: Message[];
  preCompactTokenCount: number;
  postCompactTokenCount: number;
  attachments: Message[];
}

// ─── Compact Trigger ───

export interface AutoCompactState {
  compacted: boolean;
  turnCounter: number;
  turnId: string;
  consecutiveFailures: number; // always initialized, 0 = no failures
}

// ─── Compact Config ───

export interface CompactConfig {
  /** Buffer tokens to reserve for output */
  outputBufferTokens: number;
  /** Safety margin after compaction */
  compactBufferTokens: number;
  /** Warning threshold buffer */
  warningThresholdBuffer: number;
  /** Auto-compact trigger ratio (% of effective window) */
  autoCompactRatio: number;
  /** Max consecutive failures before circuit break */
  maxConsecutiveFailures: number;
  /** Models and their context windows */
  modelContextWindows: Record<string, number>;
}

export const DEFAULT_COMPACT_CONFIG: CompactConfig = {
  outputBufferTokens: 20_000,
  compactBufferTokens: 13_000,
  warningThresholdBuffer: 20_000,
  autoCompactRatio: 0.85,
  maxConsecutiveFailures: 3,
  modelContextWindows: {
    'deepseek-chat': 128_000,
    'deepseek-reasoner': 128_000,
    'default': 128_000,
  },
};
