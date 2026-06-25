/**
 * Tool registry — inspired by Claude Code's tools.ts
 */
import type { Tool } from './Tool.js';
import { BashTool } from './built-in/BashTool.js';
import { FileReadTool } from './built-in/FileReadTool.js';
import { FileWriteTool } from './built-in/FileWriteTool.js';
import { FileEditTool } from './built-in/FileEditTool.js';
import { GlobTool } from './built-in/GlobTool.js';
import { GrepTool } from './built-in/GrepTool.js';
import { WebSearchTool } from './built-in/WebSearchTool.js';
import { WebFetchTool } from './built-in/WebFetchTool.js';

const ALL_BASE_TOOLS: readonly Tool[] = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  WebSearchTool,
  WebFetchTool,
];

export function getAllTools(): readonly Tool[] {
  return ALL_BASE_TOOLS;
}

export function getEnabledTools(): readonly Tool[] {
  return ALL_BASE_TOOLS.filter((t) => t.isEnabled?.() ?? true);
}

export function toolToApiDefinition(tool: Tool): any {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}
