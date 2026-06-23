/**
 * Bridge module — ported from Claude Code's bridge system.
 * Provides:
 * - Session ID compatibility (cse_* <-> session_*)
 * - Trusted device token management
 * - Session bridging for remote control
 */

// ─── Session ID Compatibility ───

let cseShimEnabled = true;

export function setCseShimGate(gate: () => boolean): void {
  cseShimEnabled = gate();
}

export function toCompatSessionId(id: string): string {
  if (!cseShimEnabled) return id;
  if (id.startsWith('cse_')) {
    return 'session_' + id.slice(4);
  }
  return id;
}

export function toInfraSessionId(id: string): string {
  if (!cseShimEnabled) return id;
  if (id.startsWith('session_')) {
    return 'cse_' + id.slice(8);
  }
  return id;
}

// ─── Trusted Device Token ───

let cachedTrustedDeviceToken: string | undefined;

export function getTrustedDeviceToken(): string | undefined {
  if (cachedTrustedDeviceToken !== undefined) return cachedTrustedDeviceToken;

  // Check environment variable
  const envToken = process.env.YOURCA_TRUSTED_DEVICE_TOKEN;
  if (envToken) {
    cachedTrustedDeviceToken = envToken;
    return envToken;
  }

  return undefined;
}

export function setTrustedDeviceToken(token: string): void {
  cachedTrustedDeviceToken = token;
}

export function clearTrustedDeviceTokenCache(): void {
  cachedTrustedDeviceToken = undefined;
}

// ─── Session State ───

export interface SessionState {
  sessionId: string;
  mode: 'normal' | 'coordinator' | 'vim';
  startTime: number;
  lastActiveTime: number;
  turnCount: number;
}

let currentSession: SessionState | null = null;

export function createSession(sessionId: string): SessionState {
  currentSession = {
    sessionId,
    mode: 'normal',
    startTime: Date.now(),
    lastActiveTime: Date.now(),
    turnCount: 0,
  };
  return currentSession;
}

export function getSession(): SessionState | null {
  return currentSession;
}

export function updateSessionActivity(): void {
  if (currentSession) {
    currentSession.lastActiveTime = Date.now();
    currentSession.turnCount++;
  }
}

export function endSession(): void {
  currentSession = null;
}
