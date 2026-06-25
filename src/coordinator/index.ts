/**
 * Multi-Agent Coordinator — mode selection and agent lifecycle.
 *
 * Modes:
 *   coordinator → env var YOURCA_COORDINATOR_MODE, centralized orchestration
 *   delm        → env var YOURCA_DELM_MODE, decentralized gist-based coordination
 *   normal      → default, AgentTool always available but model decides usage
 */

import {
  setCoordinatorMode as _setCoordinatorMode,
  isCoordinatorMode as _isCoordinatorMode,
  getCoordinatorSystemPrompt,
  getCoordinatorUserContext,
} from './coordinatorMode.js';

import {
  setDelmMode as _setDelmMode,
  isDelmMode as _isDelmMode,
  publishToGist as _publishToGist,
  getLatestGist,
  getVerifiedFacts,
  getFailureLog,
  addTask as _addTask,
  claimNextTask,
  completeTask,
  failTask,
  getTaskStatus,
  registerAgent as _registerAgent,
  setAgentStatus,
  buildDelmSystemPrompt,
  broadcastVerification,
} from './delmMode.js';

// Active agent tracking for SendMessage/TaskStop
export interface ActiveAgent {
  id: string;
  name: string;
  agentType: string;
  status: 'running' | 'completed' | 'failed';
  abortController: AbortController;
  startTime: number;
  description: string;
}

const activeAgents = new Map<string, ActiveAgent>();

// ─── Mode Detection ───

export type AgentArchitecture = 'coordinator' | 'delm' | 'normal';

export function detectArchitecture(): AgentArchitecture {
  if (process.env.YOURCA_COORDINATOR_MODE === '1') return 'coordinator';
  if (process.env.YOURCA_DELM_MODE === '1') return 'delm';
  return 'normal';
}

export function setArchitecture(mode: AgentArchitecture): void {
  _setCoordinatorMode(mode === 'coordinator');
  _setDelmMode(mode === 'delm');
}

export function getArchitecture(): AgentArchitecture {
  if (_isCoordinatorMode()) return 'coordinator';
  if (_isDelmMode()) return 'delm';
  return 'normal';
}

export function getArchitectureSystemPrompt(): string {
  const mode = getArchitecture();
  switch (mode) {
    case 'coordinator': return getCoordinatorSystemPrompt();
    case 'delm': return buildDelmSystemPrompt();
    default: return '';
  }
}

// ─── Agent Lifecycle ───

export function registerAgent(agent: Omit<ActiveAgent, 'startTime'>): void {
  activeAgents.set(agent.id, { ...agent, startTime: Date.now() });
}

export function updateAgentStatus(id: string, status: ActiveAgent['status']): void {
  const agent = activeAgents.get(id);
  if (agent) agent.status = status;
}

export function getActiveAgent(id: string): ActiveAgent | undefined {
  return activeAgents.get(id);
}

export function getActiveAgents(): ActiveAgent[] {
  return Array.from(activeAgents.values()).filter(a => a.status === 'running');
}

export function stopAgent(id: string): boolean {
  const agent = activeAgents.get(id);
  if (agent && agent.abortController) {
    agent.abortController.abort();
    agent.status = 'failed';
    return true;
  }
  return false;
}

// ─── DeLM Mode Exports ───

export const isDelmMode = _isDelmMode;
export const setDelmMode = _setDelmMode;
export const publishToGist = _publishToGist;
export const isCoordinatorMode = _isCoordinatorMode;
export const setCoordinatorMode = _setCoordinatorMode;
export { getCoordinatorUserContext, claimNextTask, completeTask, failTask, getTaskStatus, setAgentStatus, getLatestGist, getVerifiedFacts, getFailureLog, buildDelmSystemPrompt, broadcastVerification };
export { addTask as addDelmTask, registerAgent as registerDelmAgent } from './delmMode.js';
