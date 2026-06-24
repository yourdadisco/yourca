import type { BuiltInAgentDefinition } from './types.js';
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js';
import { EXPLORE_AGENT } from './built-in/exploreAgent.js';
import { VERIFY_AGENT } from './built-in/verifyAgent.js';

const BUILT_IN_AGENTS: BuiltInAgentDefinition[] = [];

export function getBuiltInAgents(): BuiltInAgentDefinition[] {
  if (BUILT_IN_AGENTS.length === 0) {
    BUILT_IN_AGENTS.push(GENERAL_PURPOSE_AGENT, EXPLORE_AGENT, VERIFY_AGENT);
  }
  return [...BUILT_IN_AGENTS];
}

export function findAgent(agentType: string): BuiltInAgentDefinition | undefined {
  return getBuiltInAgents().find(a => a.agentType === agentType);
}
