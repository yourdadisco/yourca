/**
 * Base tool types — inspired by Claude Code's Tool.ts
 */

export interface ToolPermissionContext {
  mode: 'accept' | 'bypass' | 'auto';
  additionalWorkingDirectories: string[];
}

export interface ToolUseContext {
  abortController: AbortController;
  getAppState: () => any;
  setAppState: (f: (prev: any) => any) => void;
  messages: Message[];
  renderedSystemPrompt?: string;
  permissionContext: ToolPermissionContext;
  requestPrompt?: (prompt: string, options?: { timeout?: number }) => Promise<string>;
}

export interface Message {
  role: 'user' | 'assistant';
  content: Content[];
}

export type Content =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: ToolResultContent[]; is_error?: boolean };

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  aliases?: string[];
  userFacingName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(input: Record<string, unknown>, context: ToolUseContext): Promise<ToolResult>;
  isEnabled?(): boolean;
  isReadOnly?(): boolean;
  isConcurrencySafe?(): boolean;
  isDestructive?(): boolean;
}

export interface ToolDef {
  name: string;
  aliases?: string[];
  userFacingName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(input: Record<string, unknown>, context: ToolUseContext): Promise<ToolResult>;
  isEnabled?: () => boolean;
  isReadOnly?: () => boolean;
  isConcurrencySafe?: () => boolean;
  isDestructive?: () => boolean;
}

export function buildTool(def: ToolDef): Tool {
  return {
    ...def,
    isEnabled: def.isEnabled ?? (() => true),
    isReadOnly: def.isReadOnly ?? (() => false),
    isConcurrencySafe: def.isConcurrencySafe ?? (() => false),
    isDestructive: def.isDestructive ?? (() => false),
  };
}

export function findToolByName(tools: readonly Tool[], name: string): Tool | undefined {
  return tools.find(
    (t) =>
      t.name === name ||
      t.aliases?.includes(name),
  );
}
