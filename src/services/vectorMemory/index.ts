/**
 * MemPalace — full embedded integration of @mempalace/core.
 *
 * Uses every feature available:
 *   VectorStorage  → LanceDB vector store (all-MiniLM-L6-v2)
 *   MemoryStack    → L0 (identity) + L1 (facts) + L2 (rooms) + L3 (deep search)
 *   KnowledgeGraph → entity-relationship triples with temporal tracking
 *   chunkText      → sentence-boundary chunking
 *   mineDirectory  → automatic project file indexing
 *   detectEntities → entity extraction from content
 *
 * MIT license, open source, npm installed — nothing to stop us.
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
  mineDirectory,
  scanProject,
  detectEntities,
  buildGraph,
  traverseGraph,
  type Drawer,
  type Entity,
  type Triple,
} from '@mempalace/core';

// ─── Re-export ───

export type { Drawer, Entity, Triple };
export { VectorStorage, MemoryStack, KnowledgeGraph, MempalaceConfig, chunkText, mineDirectory, scanProject, detectEntities, buildGraph, traverseGraph };

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

// ─── Singletons ───

let _config: MempalaceConfig | null = null;
let _storage: VectorStorage | null = null;
let _stack: MemoryStack | null = null;
let _kg: KnowledgeGraph | null = null;
let _ready = false;

function ensure(): void { if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true }); }
function cfg(): MempalaceConfig { if (!_config) { ensure(); _config = new MempalaceConfig(BASE); } return _config; }

/**
 * Initialize the full MemPalace stack. Call once at startup.
 */
export async function initMempalace(): Promise<void> {
  if (_ready) return;
  ensure();

  _storage = new VectorStorage(DB_PATH, TABLE);
  await _storage.init();

  _stack = new MemoryStack(cfg(), _storage);

  _kg = new KnowledgeGraph(KG_PATH);

  _ready = true;
}

export function isReady(): boolean { return _ready; }

export async function getStorage(): Promise<VectorStorage> {
  if (!_ready) await initMempalace();
  return _storage!;
}

export async function getStack(): Promise<MemoryStack> {
  if (!_ready) await initMempalace();
  return _stack!;
}

export async function getKG(): Promise<KnowledgeGraph> {
  if (!_ready) await initMempalace();
  return _kg!;
}

// ─── L0 / L1 — Wake-up context ───

/** Get L0 (identity) + L1 (critical facts) as a wake-up string. */
export async function wakeUp(wing?: string): Promise<string> {
  const stack = await getStack();
  return stack.wakeUp(wing);
}

/** Get L2 room recall as a context string. */
export async function recall(wing?: string, room?: string, n?: number): Promise<string> {
  const stack = await getStack();
  return stack.recall(wing, room, n);
}

/** L3 deep search across all drawers. */
export async function deepSearch(query: string, wing?: string, room?: string, n?: number): Promise<string> {
  const stack = await getStack();
  return stack.search(query, wing, room, n);
}

// ─── Storage ───

export async function storeMemory(
  content: string,
  options?: { wing?: string; room?: string; hall?: string; tags?: string[] },
): Promise<string[]> {
  const s = await getStorage();
  const wing = options?.wing ?? 'default';
  const room = options?.room ?? 'conversation';
  const hall = options?.hall ?? 'fact';
  const now = new Date().toISOString();

  const chunks = chunkText(content);
  const drawers: Drawer[] = chunks.map((c, i) => ({
    id: `${wing}_${room}_${Date.now().toString(36)}_${i}`,
    content: c.content,
    wing,
    room,
    sourceFile: options?.tags?.join(',') ?? '',
    chunkIndex: c.chunkIndex,
    addedBy: 'yourca',
    filedAt: now,
    hall,
    type: 'memory',
    agent: 'yourca',
    date: now.split('T')[0],
  }));

  await s.upsertDrawers(drawers);

  // Also populate KG entities
  try {
    const kg = await getKG();
    const entities = detectEntities(content);
    for (const [name, count] of entities) {
      kg.addEntity(name, count > 3 ? 'concept' : 'unknown', { mentions: count, source: 'yourca' });
    }
  } catch {}

  return drawers.map(d => d.id);
}

// ─── Search ───

export async function searchMemories(
  query: string,
  limit?: number,
  filter?: { wing?: string; room?: string },
): Promise<SearchHit[]> {
  const s = await getStorage();
  const results = await s.search(query, limit, filter);
  return results.map(r => ({ chunk: r, score: r.similarity }));
}

export async function searchByKeyword(query: string, limit?: number): Promise<SearchHit[]> {
  return searchMemories(query, limit);
}

export async function searchBySemantic(query: string, limit?: number): Promise<SearchHit[]> {
  return searchMemories(query, limit);
}

// ─── Knowledge Graph ───

export async function addEntity(name: string, type?: string, props?: Record<string, any>): Promise<string> {
  const kg = await getKG();
  return kg.addEntity(name, type, props);
}

export async function addTriple(triple: Triple): Promise<string> {
  const kg = await getKG();
  return kg.addTriple(triple);
}

export async function queryEntity(name: string): Promise<Triple[]> {
  const kg = await getKG();
  return kg.queryEntity(name);
}

export async function kgStats(): Promise<{ entities: any; triples: any; current: any; expired: number; types: any[] }> {
  const kg = await getKG();
  return kg.stats() as any;
}

// ─── Project Mining ───

export async function mineProject(dir: string): Promise<{ files: number }> {
  const s = await getStorage();
  const files = scanProject(dir);
  await mineDirectory(dir, s, cfg() as any, 'yourca');
  return { files: files.length };
}

// ─── RAG ───

export async function buildRagContext(
  query: string,
  maxResults?: number,
  maxTokens?: number,
): Promise<string> {
  const results = await searchMemories(query, maxResults);
  if (results.length === 0) return '';

  const parts = ['## Relevant Memories\n'];
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

export async function enhanceSystemPrompt(base: string, query: string): Promise<string> {
  // L0+L1 wake-up
  let l0l1 = '';
  try { l0l1 = await wakeUp(); } catch {}

  // L3 deep search
  let rag = await buildRagContext(query);

  const extras = [];
  if (l0l1) extras.push(l0l1);
  if (rag) extras.push(rag);
  return extras.length ? `${base}\n\n${extras.join('\n\n')}` : base;
}

// ─── Stats & Admin ───

export function getMemoryStats(): { vectorSizeKB: number } {
  try {
    const s = fs.statSync(DB_PATH);
    return { vectorSizeKB: Math.ceil(s.size / 1024) };
  } catch { return { vectorSizeKB: 0 }; }
}

export function clearMemories(): void {
  _storage = null; _stack = null; _kg = null; _config = null; _ready = false;
  try { fs.rmSync(BASE, { recursive: true, force: true }); } catch {}
}
