/**
 * Multi-Agent Coordinator — supports two modes:
 *
 * 1. COORDINATOR MODE (Claude Code style, centralized)
 * 2. DeLM MODE (Stanford 2026, decentralized)
 * 3. HYBRID — combine both
 */

import {
  setCoordinatorMode as _setCoordinatorMode,
  isCoordinatorMode as _isCoordinatorMode,
  getCoordinatorSystemPrompt as _getCoordinatorSystemPrompt,
  getCoordinatorUserContext as _getCoordinatorUserContext,
} from './coordinatorMode.js';

import {
  setDelmMode as _setDelmMode,
  isDelmMode as _isDelmMode,
  publishToGist as _publishToGist,
  getLatestGist as _getLatestGist,
  getVerifiedFacts as _getVerifiedFacts,
  getFailureLog as _getFailureLog,
  addTask as _addTask,
  claimNextTask as _claimNextTask,
  completeTask as _completeTask,
  failTask as _failTask,
  getTaskStatus as _getTaskStatus,
  registerAgent as _registerAgent,
  setAgentStatus as _setAgentStatus,
  findAgents as _findAgents,
  getRegisteredAgents as _getRegisteredAgents,
  buildDelmSystemPrompt as _buildDelmSystemPrompt,
  broadcastVerification as _broadcastVerification,
} from './delmMode.js';

// ─── Re-export everything ───

export const setCoordinatorMode = _setCoordinatorMode;
export const isCoordinatorMode = _isCoordinatorMode;
export const getCoordinatorSystemPrompt = _getCoordinatorSystemPrompt;
export const getCoordinatorUserContext = _getCoordinatorUserContext;

export const setDelmMode = _setDelmMode;
export const isDelmMode = _isDelmMode;
export const publishToGist = _publishToGist;
export const getLatestGist = _getLatestGist;
export const getVerifiedFacts = _getVerifiedFacts;
export const getFailureLog = _getFailureLog;
export const addTask = _addTask;
export const claimNextTask = _claimNextTask;
export const completeTask = _completeTask;
export const failTask = _failTask;
export const getTaskStatus = _getTaskStatus;
export const registerAgent = _registerAgent;
export const setAgentStatus = _setAgentStatus;
export const findAgents = _findAgents;
export const getRegisteredAgents = _getRegisteredAgents;
export const buildDelmSystemPrompt = _buildDelmSystemPrompt;
export const broadcastVerification = _broadcastVerification;

// ─── Mode Selection ───

export type AgentArchitecture = 'coordinator' | 'delm' | 'hybrid';

let currentArchitecture: AgentArchitecture = 'coordinator';

export function setArchitecture(mode: AgentArchitecture): void {
  currentArchitecture = mode;
  _setCoordinatorMode(mode === 'coordinator' || mode === 'hybrid');
  _setDelmMode(mode === 'delm' || mode === 'hybrid');
}

export function getArchitecture(): AgentArchitecture {
  return currentArchitecture;
}

export function getArchitectureSystemPrompt(): string {
  switch (currentArchitecture) {
    case 'coordinator':
      return _getCoordinatorSystemPrompt();
    case 'delm':
      return _buildDelmSystemPrompt();
    case 'hybrid':
      return `${_getCoordinatorSystemPrompt()}\n\n${_buildDelmSystemPrompt()}`;
    default:
      return '';
  }
}
