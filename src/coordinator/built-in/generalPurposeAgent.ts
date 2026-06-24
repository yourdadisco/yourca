import type { BuiltInAgentDefinition } from '../types.js';

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: 'general-purpose',
  whenToUse: 'General-purpose agent for multi-step tasks. Use when you need to spawn a sub-agent for research, implementation, or any complex work.',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  maxTurns: 20,
  getSystemPrompt: () => `You are a sub-agent for YourCA. Use the available tools to complete the task. Respond with a concise report of what was done.`,
};
