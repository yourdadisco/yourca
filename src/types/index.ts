/**
 * Type definitions — ported from Claude Code's types directory.
 * Centralized type system for the entire application.
 */

// ─── Message Types ───

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export const MESSAGE_ROLES: MessageRole[] = ['user', 'assistant', 'system', 'tool'];

// ─── Permission Types ───

export type PermissionMode = 'default' | 'accept' | 'bypass' | 'auto';
export type PermissionBehavior = 'allow' | 'deny' | 'ask' | 'bypass';

export interface PermissionResult {
  behavior: PermissionBehavior;
  updatedInput?: Record<string, unknown>;
  message?: string;
}

// ─── Agent Types ───

export type AgentType = 'worker' | 'coordinator' | 'assistant' | 'planner' | 'reviewer' | 'custom';

export interface AgentDefinition {
  name: string;
  type: AgentType;
  description: string;
  systemPrompt?: string;
  allowedTools?: string[];
  model?: string;
  maxTurns?: number;
}

// ─── Entrypoint Types ───

export type EntrypointType = 'repl' | 'sdk' | 'sandbox' | 'agent' | 'mcp' | 'daemon' | 'remote';

export interface EntrypointConfig {
  type: EntrypointType;
  args: string[];
  apiKey?: string;
  model?: string;
  cwd?: string;
  verbose?: boolean;
  debug?: boolean;
}

// ─── SDK Types (ported from agentSdkTypes.ts) ───

export type SDKMessageType = 'user' | 'assistant' | 'system' | 'result' | 'stream_event' | 'progress' | 'tool_use_summary';

export interface SDKMessage {
  type: SDKMessageType;
  session_id?: string;
  uuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SDKUserMessage extends SDKMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
}

export interface SDKAssistantMessage extends SDKMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use' | 'thinking';
      [key: string]: unknown;
    }>;
  };
}

export interface SDKResultMessage extends SDKMessage {
  type: 'result';
  subtype: 'success' | 'error' | 'error_max_turns' | 'error_max_budget_usd' | 'error_during_execution';
  is_error: boolean;
  result?: string;
  duration_ms: number;
  num_turns: number;
  stop_reason: string | null;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  errors?: string[];
  structured_output?: unknown;
}

export interface SDKInitMessage extends SDKMessage {
  type: 'system';
  subtype: 'init';
}

// ─── Sandbox Types ───

export interface SandboxNetworkConfig {
  allowedDomains?: string[];
  allowManagedDomainsOnly?: boolean;
  allowLocalBinding?: boolean;
  httpProxyPort?: number;
}

export interface SandboxFilesystemConfig {
  allowWrite?: string[];
  denyWrite?: string[];
  denyRead?: string[];
  allowRead?: string[];
}

export interface SandboxSettings {
  enabled: boolean;
  failIfUnavailable?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
}

// ─── Utility Types ───

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepImmutable<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepImmutable<T[P]> : T[P];
};

export interface AsyncGenerator<T, TReturn = void, TNext = unknown> {
  next(...args: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;
  return(value: TReturn): Promise<IteratorResult<T, TReturn>>;
  throw(e: unknown): Promise<IteratorResult<T, TReturn>>;
  [Symbol.asyncIterator](): AsyncGenerator<T, TReturn, TNext>;
}
