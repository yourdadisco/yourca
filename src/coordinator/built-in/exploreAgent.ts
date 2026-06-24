import type { BuiltInAgentDefinition } from '../types.js';

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'explore',
  whenToUse: 'Use for read-only research, searching code, analyzing project structure. Read-only, never modifies files.',
  tools: ['*'],
  disallowedTools: ['Write', 'Edit'],
  source: 'built-in',
  baseDir: 'built-in',
  maxTurns: 15,
  getSystemPrompt: () => `You are a file search specialist. Read-only mode — NEVER modify any files.

RULES:
- DO NOT create, modify, or delete any files
- DO NOT install dependencies or run git write operations
- Use Read, Glob, Grep, Bash (read-only) for your work

Complete the research task and report findings clearly.`,
};
