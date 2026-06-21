/**
 * Global bootstrap state (mutable, process-level singletons)
 */

// ---- Session identity ----
let sessionId = generateId('s');
let originalCwd: string = process.cwd();
let projectRoot: string = process.cwd();
let cwd: string = process.cwd();

// ---- Cost tracking ----
let totalCostUSD = 0;
let totalAPIDuration = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;

// ---- Turn tracking ----
let turnCount = 0;

// ---- Config ----
let mainLoopModel = 'deepseek-chat';

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${hex}`;
}

// Session identity
export function getSessionId(): string { return sessionId; }
export function regenerateSessionId(): void { sessionId = generateId('s'); }

// CWD
export function getOriginalCwd(): string { return originalCwd; }
export function setOriginalCwd(dir: string): void { originalCwd = dir; }
export function getProjectRoot(): string { return projectRoot; }
export function setProjectRoot(dir: string): void { projectRoot = dir; }
export function getCwdState(): string { return cwd; }
export function setCwdState(dir: string): void { cwd = dir; }

// Model
export function getMainLoopModel(): string { return mainLoopModel; }
export function setMainLoopModel(model: string): void { mainLoopModel = model; }

// Cost tracking
export function getTotalCostUSD(): number { return totalCostUSD; }
export function addToTotalCostState(cost: number): void { totalCostUSD += cost; }
export function getTotalAPIDuration(): number { return totalAPIDuration; }
export function addToTotalDurationState(duration: number): void { totalAPIDuration += duration; }
export function addTokenUsage(input: number, output: number, _cacheCreation?: number, _cacheRead?: number): void {
  totalInputTokens += input;
  totalOutputTokens += output;
}
export function getTotalInputTokens(): number { return totalInputTokens; }
export function getTotalOutputTokens(): number { return totalOutputTokens; }

// Turn tracking
export function getTurnCount(): number { return turnCount; }
export function incrementTurnCount(): void { turnCount++; }
export function resetTurnCount(): void { turnCount = 0; }
