/**
 * Tool registry — inspired by Claude Code's tools.ts
 * Enterprise version with tool presets and permission-context filtering.
 */
import type { Tool, ToolPermissionContext } from './Tool.js';
import { filterToolsByDenyRules } from './permissions.js';
import { BashTool } from './built-in/BashTool.js';
import { FileReadTool } from './built-in/FileReadTool.js';
import { FileWriteTool } from './built-in/FileWriteTool.js';
import { FileEditTool } from './built-in/FileEditTool.js';
import { GlobTool } from './built-in/GlobTool.js';
import { GrepTool } from './built-in/GrepTool.js';
import { WebSearchTool } from './built-in/WebSearchTool.js';
import { WebFetchTool } from './built-in/WebFetchTool.js';
import { AgentTool } from './built-in/AgentTool.js';
import { SendMessageTool } from './built-in/SendMessageTool.js';
import { TaskStopTool } from './built-in/TaskStopTool.js';
import {
  MemoryStore, MemorySearch, MemoryStats, MemoryForget,
} from './built-in/MemoryTool.js';

const ALL_BASE_TOOLS: readonly Tool[] = [
  BashTool, FileReadTool, FileWriteTool, FileEditTool,
  GlobTool, GrepTool, WebSearchTool, WebFetchTool,
  MemoryStore, MemorySearch, MemoryStats, MemoryForget,
  AgentTool, SendMessageTool, TaskStopTool,
];

export function getAllTools(): readonly Tool[] {
  return ALL_BASE_TOOLS;
}

export function getEnabledTools(): readonly Tool[] {
  return ALL_BASE_TOOLS.filter((t) => t.isEnabled?.() ?? true);
}

export function getTools(permissionContext: ToolPermissionContext): Tool[] {
  const enabled = getEnabledTools();
  return filterToolsByDenyRules(enabled as Tool[], permissionContext);
}

export function toolToApiDefinition(tool: Tool): any {
  return { name: tool.name, description: tool.description, input_schema: tool.inputSchema };
}
