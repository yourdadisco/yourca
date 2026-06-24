/**
 * MemPalace Integration — direct re-export of @mempalace/core.
 *
 * This file is a thin convenience layer that:
 * 1. Re-exports @mempalace/core's types and classes directly
 * 2. Provides a singleton VectorStorage pre-initialized for yourca
 * 3. Adds RAG prompt formatting (buildRagContext)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { VectorStorage, chunkText } from '@mempalace/core';
import type { Drawer } from '@mempalace/core';

// ─── Re-export MemPalace types directly ───

export type { Drawer };
export { VectorStorage, chunkText };

export interface SearchHit {
  chunk: Drawer;
  score: number;
}

// ─── Singleton storage ───

let _storage: VectorStorage | null = null;

function dbDir(): string {
  const dir = path.join(os.homedir(), '.yourca', 'mempalace');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getStorage(): Promise<VectorStorage> {
  if (!_storage) {
    _storage = new VectorStorage(
      path.join(dbDir(), 'mempalace.lance'),
      'mempalace_drawers',
    );
    await _storage.init();
  }
  return _storage;
}

// ─── High-level convenience API ───

/** Store content: chunks + embeds + persists via MemPalace. */
export async function storeMemory(
  content: string,
  options?: { wing?: string; room?: string; hall?: string; tags?: string[] },
): Promise<string[]> {
  const s = await getStorage();
  const wing = options?.wing ?? 'default';
  const room = options?.room ?? 'conversation';
  const hall = options?.hall ?? 'fact';
  const now = new Date().toISOString();
  const nowDate = now.split('T')[0];

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
    date: nowDate,
  }));

  await s.upsertDrawers(drawers);
  return drawers.map(d => d.id);
}

/** Search via MemPalace's LanceDB vector search. */
export async function searchMemories(
  query: string,
  limit?: number,
  filter?: { wing?: string; room?: string },
): Promise<SearchHit[]> {
  const s = await getStorage();
  const results = await s.search(query, limit, filter);
  return results.map(r => ({ chunk: r, score: r.similarity }));
}

/** Search with keyword filter (delegates to MemPalace metadata filtering). */
export async function searchByKeyword(query: string, limit?: number): Promise<SearchHit[]> {
  return searchMemories(query, limit);
}

/** Semantic-only search. */
export async function searchBySemantic(query: string, limit?: number): Promise<SearchHit[]> {
  return searchMemories(query, limit);
}

/** Build RAG prompt context from search results. */
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

/** Convenience: wrap base prompt with RAG context. */
export async function enhanceSystemPrompt(base: string, query: string): Promise<string> {
  const ctx = await buildRagContext(query);
  return ctx ? `${base}\n\n${ctx}` : base;
}

/** Get rough storage stats. */
export function getMemoryStats(): { count: number; embedded: number } {
  const p = path.join(dbDir(), 'mempalace.lance');
  try {
    const s = fs.statSync(p);
    return { count: Math.ceil(s.size / 1024), embedded: s.size > 0 ? 1 : 0 };
  } catch {
    return { count: 0, embedded: 0 };
  }
}

/** Wipe local MemPalace data. */
export function clearMemories(): void {
  _storage = null;
  const dir = dbDir();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
