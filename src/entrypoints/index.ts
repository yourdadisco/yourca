/**
 * Entrypoints system — ported from Claude Code's entrypoints.
 * Provides:
 * - Multiple entry modes (REPL, SDK, sandbox, agent, MCP, daemon, remote)
 * - SDK types and session management
 * - CLI argument parsing with fast-path support
 * - Session resume capability
 */

import type { EntrypointType, EntrypointConfig, AgentDefinition } from '../types/index.js';

// ─── Entrypoint Registry ───

export interface EntrypointHandler {
  type: EntrypointType;
  description: string;
  handle(config: EntrypointConfig): Promise<void>;
}

const entrypointRegistry = new Map<EntrypointType, EntrypointHandler>();

export function registerEntrypoint(handler: EntrypointHandler): void {
  entrypointRegistry.set(handler.type, handler);
}

export function getEntrypoint(type: EntrypointType): EntrypointHandler | undefined {
  return entrypointRegistry.get(type);
}

export function getAllEntrypoints(): EntrypointHandler[] {
  return Array.from(entrypointRegistry.values());
}

// ─── CLI Argument Parsing ───

export interface ParsedArgs {
  entrypoint: EntrypointType;
  config: EntrypointConfig;
  prompt?: string;
  fastPaths: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const fastPaths: string[] = [];
  let remainingIds: string[] = [];
  let apiKeyArg: string | undefined;
  let modelArg: string | undefined;
  let verbose = false;
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Fast path flags
    if (arg === '--version' || arg === '-v') {
      fastPaths.push('version');
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      fastPaths.push('help');
      continue;
    }
    if (arg === '--setup') {
      fastPaths.push('setup');
      continue;
    }
    if (arg === '--api-key' && i + 1 < args.length) {
      apiKeyArg = args[++i];
      continue;
    }
    if (arg.startsWith('--api-key=')) {
      apiKeyArg = arg.split('=')[1];
      continue;
    }
    if (arg === '--model' && i + 1 < args.length) {
      modelArg = args[++i];
      continue;
    }
    if (arg === '--verbose' || arg === '-V') {
      verbose = true;
      continue;
    }
    if (arg === '--debug') {
      debug = true;
      continue;
    }
    if (arg === '--bare') {
      process.env.YOURCA_SIMPLE = '1';
      continue;
    }
    if (arg === '--agent' && i + 1 < args.length) {
      fastPaths.push('agent');
      continue;
    }
    if (arg === '-') {
      // Stdin mode
      fastPaths.push('stdin');
      continue;
    }

    // Positional arguments are treated as prompt
    remainingIds.push(arg);
  }

  const prompt = remainingIds.join(' ');

  const config: EntrypointConfig = {
    type: 'repl',
    args: remainingIds,
    apiKey: apiKeyArg,
    model: modelArg,
    verbose,
    debug,
  };

  let entrypoint: EntrypointType = 'repl';
  if (fastPaths.includes('agent')) entrypoint = 'agent';

  // If there's a prompt and no interactive flags, it's a single query
  if (prompt && !fastPaths.includes('help') && !fastPaths.includes('setup') && !fastPaths.includes('version')) {
    // Single query mode
  }

  return { entrypoint, config, prompt: prompt || undefined, fastPaths };
}

// ─── Agent Definition ───

export function createAgentDefinition(name: string, type: string, description: string, options?: Partial<AgentDefinition>): AgentDefinition {
  return {
    name,
    type: type as AgentDefinition['type'],
    description,
    systemPrompt: options?.systemPrompt,
    allowedTools: options?.allowedTools,
    model: options?.model,
    maxTurns: options?.maxTurns,
  };
}

// ─── Session Management ───

export interface SessionInfo {
  sessionId: string;
  title?: string;
  startTime: number;
  lastActiveTime: number;
  turnCount: number;
  model: string;
}

const activeSessions = new Map<string, SessionInfo>();

export function createSession(sessionId: string, model: string): SessionInfo {
  const session: SessionInfo = {
    sessionId,
    startTime: Date.now(),
    lastActiveTime: Date.now(),
    turnCount: 0,
    model,
  };
  activeSessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionInfo | undefined {
  return activeSessions.get(sessionId);
}

export function listSessions(): SessionInfo[] {
  return Array.from(activeSessions.values());
}

export function updateSessionActivity(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActiveTime = Date.now();
    session.turnCount++;
  }
}

export function removeSession(sessionId: string): boolean {
  return activeSessions.delete(sessionId);
}

export function renameSession(sessionId: string, title: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.title = title;
    return true;
  }
  return false;
}

export function clearSessions(): void {
  activeSessions.clear();
}
