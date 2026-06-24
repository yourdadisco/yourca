/**
 * Tool registry — inspired by Claude Code's tools.ts
 * Enterprise version with tool presets and permission-context filtering.
 */
import type { Tool, Tools, ToolPermissionContext } from './Tool.js';
import { filterToolsByDenyRules } from './permissions.js';
import { BashTool } from './built-in/BashTool.js';
import { FileReadTool } from './built-in/FileReadTool.js';
import { FileWriteTool } from './built-in/FileWriteTool.js';
import { FileEditTool } from './built-in/FileEditTool.js';
import { GlobTool } from './built-in/GlobTool.js';
import { GrepTool } from './built-in/GrepTool.js';
import { WebSearchTool } from './built-in/WebSearchTool.js';
import { WebFetchTool } from './built-in/WebFetchTool.js';
import { WebBrowserTool } from './built-in/WebBrowserTool.js';
import {
  MemoryStore,
  MemorySearch,
  MemoryStats,
  MemoryForget,
} from './built-in/MemoryTool.js';
import { AgentTool } from './built-in/AgentTool.js';
import { SendMessageTool } from './built-in/SendMessageTool.js';
import { TaskStopTool } from './built-in/TaskStopTool.js';

const ALL_BASE_TOOLS: readonly Tool[] = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  WebSearchTool,
  WebFetchTool,
  WebBrowserTool,
  MemoryStore,
  MemorySearch,
  MemoryStats,
  MemoryForget,
  AgentTool,
  SendMessageTool,
  TaskStopTool,
];

/**
 * Get all tools (no filtering).
 */
export function getAllTools(): readonly Tool[] {
  return ALL_BASE_TOOLS;
}

/**
 * Get enabled tools only.
 */
export function getEnabledTools(): readonly Tool[] {
  return ALL_BASE_TOOLS.filter((t) => t.isEnabled?.() ?? true);
}

/**
 * Get tools filtered by permission context deny rules.
 */
export function getTools(permissionContext: ToolPermissionContext): Tool[] {
  const enabled = getEnabledTools();
  return filterToolsByDenyRules(enabled as Tool[], permissionContext);
}

/**
 * Convert tool to API definition format for the Anthropic/OpenAI API.
 */
export function toolToApiDefinition(tool: Tool): any {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}
