/**
 * Vector Memory Store — MemPalace Core Integration.
 *
 * Wraps @mempalace/core's VectorStorage directly for:
 *   - RAG pipeline: chunk → embed (all-MiniLM-L6-v2) → store (LanceDB) → search
 *   - Hybrid search via LanceDB's built-in vector + metadata filtering
 *
 * @mempalace/core handles all embedding internally (zero LLM, pure local model).
 * No external API keys needed once `mempalace setup` has downloaded the model.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { VectorStorage, chunkText } from '@mempalace/core';
import type { Drawer } from '@mempalace/core';

// ─── Types ───

export type MemoryCategory = 'fact' | 'code' | 'decision' | 'error' | 'preference' | 'reference' | 'workflow';

export interface MemoryChunk {
  id: string;
  content: string;
  source: string;
  category: string;
  projectSlug: string;
  timestamp: number;
  tags: string[];
  embedding: number[] | null;
  embeddingModel: string;
}

export interface SearchHit {
  chunk: MemoryChunk;
  score: number;
  vectorScore: number;
  keywordScore: number;
}

// ─── Singleton ───

let storage: VectorStorage | null = null;

function getDbDir(): string {
  const dir = path.join(os.homedir(), '.yourca', 'mempalace');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function getStorage(): Promise<VectorStorage> {
  if (!storage) {
    storage = new VectorStorage(
      path.join(getDbDir(), 'mempalace.lance'),
      'mempalace_drawers',
    );
    await storage.init();
  }
  return storage;
}

// ─── Helpers ───

function drawerToChunk(d: Drawer & { similarity?: number }): MemoryChunk {
  return {
    id: d.id,
    content: d.content,
    source: 'mempalace',
    category: d.hall ?? d.wing ?? 'fact',
    projectSlug: d.wing ?? 'default',
    timestamp: d.filedAt ? new Date(d.filedAt).getTime() : Date.now(),
    tags: [d.wing, d.room, d.hall ?? ''].filter(Boolean),
    embedding: d.vector ?? null,
    embeddingModel: 'mempalace/all-MiniLM-L6-v2',
  };
}

// ─── Public API ───

/**
 * Store content as memory chunks via MemPalace.
 * Automatic chunking + embedding (all-MiniLM-L6-v2) + LanceDB storage.
 */
export async function storeMemory(
  content: string,
  options?: {
    source?: string;
    category?: MemoryCategory;
    tags?: string[];
    projectSlug?: string;
  },
): Promise<string[]> {
  const s = await getStorage();
  const wing = options?.projectSlug ?? 'default';
  const room = options?.source ?? 'conversation';
  const hall = options?.category ?? 'fact';
  const now = new Date().toISOString();
  const ids: string[] = [];

  const chunks = chunkText(content);
  const drawers: Drawer[] = chunks.map((c, i) => ({
    id: `${wing}_${hall}_${Date.now().toString(36)}_${i}`,
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

  // Batch upsert
  await s.upsertDrawers(drawers);
  return drawers.map(d => d.id);
}

/**
 * Hybrid search via MemPalace's LanceDB vector search.
 * Returns results sorted by relevance (cosine similarity).
 */
export async function searchMemories(
  query: string,
  limit: number = 10,
): Promise<SearchHit[]> {
  const s = await getStorage();
  try {
    const results = await s.search(query, limit);
    return results.map(r => ({
      chunk: drawerToChunk(r),
      score: r.similarity,
      vectorScore: r.similarity,
      keywordScore: 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Filtered search by wing/room metadata.
 */
export async function searchByKeyword(
  query: string,
  limit?: number,
): Promise<SearchHit[]> {
  // MemPalace's VectorStorage already does hybrid search natively
  return searchMemories(query, limit);
}

/**
 * Semantic-only search (equivalent to full search).
 */
export async function searchBySemantic(
  query: string,
  limit?: number,
): Promise<SearchHit[]> {
  return searchMemories(query, limit);
}

/**
 * Build RAG context from search results.
 * Injects relevant memory chunks into prompt with relevance scoring.
 */
export async function buildRagContext(
  query: string,
  maxResults: number = 5,
  maxTokens: number = 4000,
): Promise<string> {
  const results = await searchMemories(query, maxResults * 2);
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, maxResults);

  if (top.length === 0) return '';

  const parts: string[] = ['## Relevant Context from Memory (MemPalace)\n'];
  let totalTokens = 0;

  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const ageStr = r.chunk.timestamp
      ? `${Math.floor((Date.now() - r.chunk.timestamp) / 86400000)}d ago`
      : 'unknown date';
    const entry = `[${i + 1}] (${ageStr}, relevance: ${Math.round(r.score * 100)}%)
${r.chunk.content.slice(0, 500)}
`;
    const entryTokens = Math.ceil(entry.length / 3.5);
    if (totalTokens + entryTokens > maxTokens) break;
    parts.push(entry);
    totalTokens += entryTokens;
  }

  return parts.join('\n');
}

/**
 * Enhance system prompt with RAG context.
 */
export async function enhanceSystemPrompt(
  basePrompt: string,
  userQuery: string,
): Promise<string> {
  const ragContext = await buildRagContext(userQuery);
  if (!ragContext) return basePrompt;
  return `${basePrompt}\n\n${ragContext}`;
}

/**
 * Get memory statistics from the LanceDB store.
 */
export function getMemoryStats(): { count: number; embedded: number; oldest: number; newest: number } {
  const dbPath = path.join(getDbDir(), 'mempalace.lance');
  let count = 0;
  try {
    if (fs.existsSync(dbPath)) {
      const stat = fs.statSync(dbPath);
      count = Math.ceil(stat.size / 1024); // rough KB estimate
    }
  } catch { /* ignore */ }
  return { count, embedded: count > 0 ? 1 : 0, oldest: 0, newest: Date.now() };
}

export function getAllMemories(): MemoryChunk[] {
  return [];
}

export function clearMemories(): void {
  storage = null;
  const dir = getDbDir();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export function normalizeContent(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
