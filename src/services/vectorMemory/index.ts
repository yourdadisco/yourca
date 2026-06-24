/**
 * MemPalace integration — YourCA's vector memory backend.
 *
 * Provides:
 *   - VectorStorage (LanceDB + all-MiniLM-L6-v2 embeddings)
 *   - MemoryStack (L0 identity / L1 facts / L2 room recall / L3 deep search)
 *   - KnowledgeGraph (entity-relationship triples with temporal tracking)
 *   - RAG context builder for system prompt injection
 *
 * All heavy dependencies (@mempalace/core internals) are loaded lazily.
 * Call initMempalace() once at startup; all other functions auto-init.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  VectorStorage,
  MemoryStack,
  KnowledgeGraph,
  MempalaceConfig,
  chunkText,
  DEFAULT_HALL_KEYWORDS,
  type Drawer,
} from '@mempalace/core';

export type { Drawer };

// ─── Types ───

export interface SearchHit {
  chunk: Drawer;
  score: number;
}

// ─── Paths ───

const BASE = path.join(os.homedir(), '.yourca', 'mempalace');
const DB_PATH = path.join(BASE, 'mempalace.lance');
const TABLE = 'mempalace_drawers';
const KG_PATH = path.join(BASE, 'knowledge.db');
const IDENTITY_PATH = path.join(BASE, 'identity.md');

const MAX_L1_TOKENS = 800;
const MAX_L3_RESULTS = 5;

// ─── Singletons ───

let _config: MempalaceConfig | null = null;
let _storage: VectorStorage | null = null;
let _stack: MemoryStack | null = null;
let _kg: KnowledgeGraph | null = null;
let _ready = false;
let _currentWing = 'default';

function ensureDir(): void {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
}

function getConfig(): MempalaceConfig {
  if (!_config) { ensureDir(); _config = new MempalaceConfig(BASE); }
  return _config;
}

// ─── Content-hash Drawer ID ───

/** Deterministic hash ID based on wing + room + content + chunkIndex.
 *  Same content always produces the same ID, so upsertDrawers overwrites
 *  rather than creating duplicates. */
export function generateDrawerId(wing: string, room: string, content: string, chunkIndex: number): string {
  let hash = 0;
  const str = `${wing}|${room}|${content}|${chunkIndex}`;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `${wing}_${room}_${Math.abs(hash).toString(36)}`;
}

// ─── Wing Detection ───

/** Auto-detect wing from the current working directory.
 *  Uses git remote origin URL first, then falls back to directory name. */
export function detectProjectWing(dir?: string): string {
  const cwd = dir ?? process.cwd();
  try {
    const gitDir = path.join(cwd, '.git');
    if (fs.existsSync(gitDir)) {
      const gitConfig = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
      const match = gitConfig.match(/\[remote "origin"\][\s\S]*?url\s*=\s*.+?\/(.+?)\.git/);
      if (match?.[1]) return match[1].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
  } catch {}
  return path.basename(cwd).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

/** Auto-detect hall from content using MemPalace's DEFAULT_HALL_KEYWORDS. */
export function detectHall(content: string): string {
  const lower = content.toLowerCase();
  for (const [hall, keywords] of Object.entries(DEFAULT_HALL_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return hall;
    }
  }
  return 'general';
}

/** Get/set the current wing for this session. */
export function setCurrentWing(wing: string): void { _currentWing = wing; }
export function getCurrentWing(): string { return _currentWing; }

// ─── Initialization ───

/**
 * Initialize the full MemPalace stack. Idempotent — safe to call multiple times.
 * Writes L0 identity file, then initializes VectorStorage + MemoryStack + KnowledgeGraph.
 */
export async function initMempalace(options?: {
  l0Identity?: string;
  wing?: string;
}): Promise<void> {
  if (_ready) return;
  ensureDir();

  // Write L0 identity file
  const identity = options?.l0Identity ?? 'You are YourCA, a general-purpose AI assistant powered by DeepSeek.';
  try { fs.writeFileSync(IDENTITY_PATH, identity, 'utf-8'); } catch {}

  _storage = new VectorStorage(DB_PATH, TABLE);
  await _storage.init();

  _stack = new MemoryStack(getConfig(), _storage);
  _kg = new KnowledgeGraph(KG_PATH);

  _currentWing = options?.wing ?? detectProjectWing();
  _ready = true;
}

export function isReady(): boolean { return _ready; }
export async function getStorage(): Promise<VectorStorage> {
  if (!_ready) await initMempalace(); return _storage!;
}
export async function getStack(): Promise<MemoryStack> {
  if (!_ready) await initMempalace(); return _stack!;
}
export async function getKG(): Promise<KnowledgeGraph> {
  if (!_ready) await initMempalace(); return _kg!;
}

// ─── L0 / L1 — Wake-up identity & facts ───

/** Get L0 (identity) + L1 (critical facts) as a context string. */
export async function wakeUp(wing?: string): Promise<string> {
  const stack = _stack ?? (await initMempalace(), _stack!);
  return stack.wakeUp(wing);
}

/** Get L2 (room-level) recall as a context string. */
export async function recall(wing?: string, room?: string, n?: number): Promise<string> {
  const stack = _stack ?? (await initMempalace(), _stack!);
  return stack.recall(wing, room, n);
}

/** L3 deep semantic search across all drawers, returned as a formatted string. */
export async function deepSearch(query: string, wing?: string, room?: string, n?: number): Promise<string> {
  const stack = _stack ?? (await initMempalace(), _stack!);
  return stack.search(query, wing, room, n);
}

// ─── Storage ───

/**
 * Store content into vector memory:
 *   1. Auto-detects hall from content (via DEFAULT_HALL_KEYWORDS)
 *   2. Chunks content by sentence boundaries (via chunkText)
 *   3. Generates content-hash drawer IDs (deduplicates on re-store)
 *   4. Embeds + upserts into LanceDB
 *   5. Extracts entities and populates the knowledge graph (best-effort)
 */
export async function storeMemory(
  content: string,
  options?: { wing?: string; room?: string; tags?: string[] },
): Promise<string[]> {
  const s = _storage ?? (await initMempalace(), _storage!);
  const wing = options?.wing ?? _currentWing;
  const room = options?.room ?? 'conversation';
  const hall = detectHall(content);
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];

  const chunks = chunkText(content);
  const drawers: Drawer[] = chunks.map((c, i) => ({
    id: generateDrawerId(wing, room, c.content, c.chunkIndex),
    content: c.content,
    wing, room, hall,
    sourceFile: options?.tags?.join(',') ?? '',
    chunkIndex: c.chunkIndex,
    addedBy: 'yourca',
    filedAt: now,
    type: 'memory', agent: 'yourca', date: dateStr,
  }));

  await s.upsertDrawers(drawers);

  // Populate knowledge graph with extracted entities (best-effort)
  try {
    const kg = await getKG();
    const { detectEntities } = await import('@mempalace/core');
    const entities = detectEntities(content);
    for (const [name, count] of entities) {
      kg.addEntity(name, count > 3 ? 'concept' : 'unknown', { mentions: count, source: 'yourca' });
    }
  } catch {}

  return drawers.map(d => d.id);
}

/** Auto-save conversation text to the current wing. Called after each assistant turn. */
export async function autoSave(conversationText: string): Promise<void> {
  if (!conversationText.trim()) return;
  await storeMemory(conversationText, { wing: _currentWing, room: 'conversation' });
}

// ─── Search ───

/**
 * Hybrid semantic + keyword search across all stored memories.
 * Results are ordered by similarity (cosine distance).
 */
export async function searchMemories(
  query: string,
  limit?: number,
  filter?: { wing?: string; room?: string },
): Promise<SearchHit[]> {
  const s = _storage ?? (await initMempalace(), _storage!);
  const results = await s.search(query, limit, filter);
  return results.map(r => ({ chunk: r, score: r.similarity }));
}

/** Get taxonomy stats across all wings/rooms. */
export async function getWingStats(): Promise<{ wings: Record<string, number>; rooms: Record<string, number>; total: number }> {
  const s = await getStorage();
  return s.getTaxonomy();
}

// ─── RAG ───

/**
 * Build a formatted context string from relevant memories for system prompt injection.
 */
export async function buildRagContext(
  query: string,
  maxResults?: number,
  maxTokens?: number,
): Promise<string> {
  const results = await searchMemories(query, maxResults);
  if (results.length === 0) return '';

  const parts: string[] = ['## Relevant Memories\n'];
  let tok = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const age = r.chunk.filedAt
      ? `${Math.floor((Date.now() - new Date(r.chunk.filedAt).getTime()) / 86400000)}d`
      : '?';
    const text = `[${i + 1}] (${age}, ${r.chunk.hall ?? r.chunk.wing}, ${Math.round(r.score * 100)}%)\n${r.chunk.content.slice(0, 500)}\n`;
    const t = Math.ceil(text.length / 3.5);
    if (maxTokens && tok + t > maxTokens) break;
    parts.push(text);
    tok += t;
  }

  return parts.join('\n');
}

/**
 * Enhance a system prompt with memory context:
 *   - L0 + L1 (wake-up context for current wing)
 *   - L3 (deep search) RAG results for the given query
 */
export async function enhanceSystemPrompt(base: string, query: string): Promise<string> {
  let l0l1 = '';
  try {
    l0l1 = await wakeUp(_currentWing);
  } catch {}
  const rag = await buildRagContext(query);
  const extras: string[] = [];
  if (l0l1) extras.push(l0l1);
  if (rag) extras.push(rag);
  return extras.length ? `${base}\n\n${extras.join('\n\n')}` : base;
}

// ─── Stats & Admin ───

export function getMemoryStats(): { vectorSizeKB: number } {
  try {
    const stat = fs.statSync(DB_PATH);
    return { vectorSizeKB: Math.ceil(stat.size / 1024) };
  } catch { return { vectorSizeKB: 0 }; }
}

export function clearMemories(): void {
  _storage = null; _stack = null; _kg = null; _config = null; _ready = false;
  try { fs.rmSync(BASE, { recursive: true, force: true }); } catch {}
}
