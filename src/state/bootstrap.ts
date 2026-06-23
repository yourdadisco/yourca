/**
 * Global bootstrap state (mutable, process-level singletons)
 * Ported from Claude Code's bootstrap with enterprise-grade state tracking:
 * - Model-specific token & cost tracking
 * - Lines changed tracking (added/removed)
 * - Cache token tracking (cache read/write)
 * - Web search request tracking
 * - Session persistence support
 * - Duration tracking (API wall-clock, tool execution)
 */

// ---- Session identity ----
let sessionId = generateId('s');
let originalCwd: string = process.cwd();
let projectRoot: string = process.cwd();
let cwd: string = process.cwd();

// ---- Cost tracking (model-specific) ----
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
}

let totalCostUSD = 0;
let totalAPIDuration = 0;
let totalAPIDurationWithoutRetries = 0;
let totalToolDuration = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCacheReadInputTokens = 0;
let totalCacheCreationInputTokens = 0;
let totalWebSearchRequests = 0;
let totalLinesAdded = 0;
let totalLinesRemoved = 0;
let lastDuration: number | undefined;

let modelUsageMap: { [modelName: string]: ModelUsage } = {};
let unknownModelCost = false;

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

// ---- Enterprise cost tracking ----

export function getTotalCostUSD(): number { return totalCostUSD; }

export function addToTotalCostState(cost: number, modelUsage?: ModelUsage, model?: string): void {
  totalCostUSD += cost;
  if (modelUsage && model) {
    modelUsageMap[model] = modelUsage;
  }
}

export function getTotalAPIDuration(): number { return totalAPIDuration; }
export function addToTotalDurationState(duration: number): void { totalAPIDuration += duration; }

export function getTotalAPIDurationWithoutRetries(): number { return totalAPIDurationWithoutRetries; }
export function addToTotalAPIDurationWithoutRetries(duration: number): void { totalAPIDurationWithoutRetries += duration; }

export function getTotalToolDuration(): number { return totalToolDuration; }
export function addToTotalToolDuration(duration: number): void { totalToolDuration += duration; }

export function getTotalDuration(): number {
  return (lastDuration ?? 0) + totalAPIDuration;
}

export function addTokenUsage(
  input: number,
  output: number,
  cacheCreation?: number,
  cacheRead?: number,
): void {
  totalInputTokens += input;
  totalOutputTokens += output;
  if (cacheCreation) totalCacheCreationInputTokens += cacheCreation;
  if (cacheRead) totalCacheReadInputTokens += cacheRead;
}

export function getTotalInputTokens(): number { return totalInputTokens; }
export function getTotalOutputTokens(): number { return totalOutputTokens; }
export function getTotalCacheReadInputTokens(): number { return totalCacheReadInputTokens; }
export function getTotalCacheCreationInputTokens(): number { return totalCacheCreationInputTokens; }
export function getTotalWebSearchRequests(): number { return totalWebSearchRequests; }
export function addWebSearchRequest(): void { totalWebSearchRequests++; }

// Lines changed
export function getTotalLinesAdded(): number { return totalLinesAdded; }
export function addToTotalLinesChanged(added: number, removed: number): void {
  totalLinesAdded += added;
  totalLinesRemoved += removed;
}
export function getTotalLinesRemoved(): number { return totalLinesRemoved; }

// Model-specific usage
export function getModelUsage(): { [modelName: string]: ModelUsage } {
  return { ...modelUsageMap };
}

export function getUsageForModel(model: string): ModelUsage | undefined {
  return modelUsageMap[model];
}

export function setUsageForModel(model: string, usage: ModelUsage): void {
  modelUsageMap[model] = usage;
}

// Unknown model cost flag
export function hasUnknownModelCost(): boolean { return unknownModelCost; }
export function setHasUnknownModelCost(v: boolean): void { unknownModelCost = v; }

// Turn tracking
export function getTurnCount(): number { return turnCount; }
export function incrementTurnCount(): void { turnCount++; }
export function resetTurnCount(): void { turnCount = 0; }

// ---- Session persistence ----

export interface StoredCostState {
  totalCostUSD: number;
  totalAPIDuration: number;
  totalAPIDurationWithoutRetries: number;
  totalToolDuration: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  lastDuration: number | undefined;
  modelUsage: { [modelName: string]: ModelUsage } | undefined;
}

export function setCostStateForRestore(data: StoredCostState): void {
  totalCostUSD = data.totalCostUSD;
  totalAPIDuration = data.totalAPIDuration;
  totalAPIDurationWithoutRetries = data.totalAPIDurationWithoutRetries;
  totalToolDuration = data.totalToolDuration;
  totalLinesAdded = data.totalLinesAdded;
  totalLinesRemoved = data.totalLinesRemoved;
  lastDuration = data.lastDuration;
  modelUsageMap = data.modelUsage ?? {};
}

export function resetStateForTests(): void {
  totalCostUSD = 0;
  totalAPIDuration = 0;
  totalAPIDurationWithoutRetries = 0;
  totalToolDuration = 0;
  totalInputTokens = 0;
  totalOutputTokens = 0;
  totalCacheReadInputTokens = 0;
  totalCacheCreationInputTokens = 0;
  totalWebSearchRequests = 0;
  totalLinesAdded = 0;
  totalLinesRemoved = 0;
  lastDuration = undefined;
  modelUsageMap = {};
  unknownModelCost = false;
  turnCount = 0;
}

export { totalInputTokens, totalOutputTokens };
