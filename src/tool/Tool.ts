/**
 * Base tool types and utilities — ported from Claude Code's Tool.ts
 * with enterprise-grade interfaces:
 * - Full permission context (always allow/deny/ask rules)
 * - Tool validation & permission checks
 * - Build tool defaults
 * - Tool matching/aliasing
 */

export interface ToolPermissionContext {
  mode: 'default' | 'accept' | 'bypass' | 'auto';
  additionalWorkingDirectories: string[];
  alwaysAllowRules?: Record<string, string[]>;
  alwaysDenyRules?: Record<string, string[]>;
  alwaysAskRules?: Record<string, string[]>;
  isBypassPermissionsModeAvailable?: boolean;
  isAutoModeAvailable?: boolean;
}

export type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string }
  | { behavior: 'ask'; message?: string }
  | { behavior: 'bypass'; updatedInput?: Record<string, unknown> };

export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number };

export interface ToolUseContext {
  options?: {
    debug?: boolean;
    verbose?: boolean;
  };
  abortController: AbortController;
  getAppState: () => any;
  setAppState: (f: (prev: any) => any) => void;
  messages: Message[];
  renderedSystemPrompt?: string;
  permissionContext: ToolPermissionContext;
  requestPrompt?: (prompt: string, options?: { timeout?: number }) => Promise<string>;
  agentId?: string;
  agentType?: string;
  toolUseId?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: Content[];
}

export type Content =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: ToolResultContent[]; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

export interface Tool<Input extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  aliases?: string[];
  /** One-line capability phrase for tool search */
  searchHint?: string;
  userFacingName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(input: Input, context: ToolUseContext): Promise<ToolResult>;
  isEnabled?(): boolean;
  isReadOnly?(input?: Input): boolean;
  isConcurrencySafe?(input?: Input): boolean;
  isDestructive?(input?: Input): boolean;
  isSearchOrReadCommand?(input?: Input): { isSearch: boolean; isRead: boolean; isList?: boolean };
  validateInput?(input: Input, context: ToolUseContext): Promise<ValidationResult>;
  checkPermissions?(input: Input, context: ToolUseContext): Promise<PermissionResult>;
  getPath?(input: Input): string;
}

export type Tools = readonly Tool[];

/**
 * Find a tool by name or alias from a list of tools.
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => t.name === name || t.aliases?.includes(name));
}

/**
 * Checks if a tool matches the given name (primary name or alias).
 */
export function toolMatchesName(tool: { name: string; aliases?: string[] }, name: string): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false);
}

/**
 * Tool definition with optional defaultable methods.
 */
export interface ToolDef<Input extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  aliases?: string[];
  searchHint?: string;
  userFacingName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(input: Input, context: ToolUseContext): Promise<ToolResult>;
  isEnabled?: () => boolean;
  isReadOnly?: (input?: Input) => boolean;
  isConcurrencySafe?: (input?: Input) => boolean;
  isDestructive?: (input?: Input) => boolean;
  isSearchOrReadCommand?: (input?: Input) => { isSearch: boolean; isRead: boolean; isList?: boolean };
  validateInput?: (input: Input, context: ToolUseContext) => Promise<ValidationResult>;
  checkPermissions?: (input: Input, context: ToolUseContext) => Promise<PermissionResult>;
  getPath?: (input: Input) => string;
}

const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isReadOnly: (_input?: unknown) => false,
  isConcurrencySafe: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (input: Record<string, unknown>): Promise<PermissionResult> =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
};

/**
 * Build a complete Tool from a partial definition, filling in safe defaults.
 */
export function buildTool<Input extends Record<string, unknown>>(def: ToolDef<Input>): Tool<Input> {
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as Tool<Input>;
}
