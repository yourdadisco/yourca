import type { BuiltInAgentDefinition } from '../types.js';

export const WORKER_AGENT: BuiltInAgentDefinition = {
  agentType: 'worker',
  whenToUse: 'Use for delegating sub-tasks that require file modifications, code changes, or any write operations. Full tool access.',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  maxTurns: 20,
  getSystemPrompt: () => `You are a worker sub-agent for YourCA. Execute the assigned task using the available tools. You have full read/write access to the filesystem. Complete the work and report what was done.`,
};
