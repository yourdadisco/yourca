/**
 * MemPalace integration — YourCA's vector memory backend.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

import {
  VectorStorage,
  MemoryStack,
  KnowledgeGraph,
  MempalaceConfig,
  chunkText as mempalaceChunkText,
  DEFAULT_HALL_KEYWORDS,
  type Drawer,
} from '@mempalace/core';

export type { Drawer };
export interface SearchHit { chunk: Drawer; score: number }

// ─── Fix __dirname for @mempalace/core embedding worker in ESM ───
if (typeof (globalThis as any).__dirname === 'undefined') {
  try {
    const ourDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgDir = path.resolve(ourDir, '..', '..', '..', 'node_modules', '@mempalace', 'core', 'dist');
    if (fs.existsSync(pkgDir)) (globalThis as any).__dirname = pkgDir;
  } catch {}
}

const BASE = path.join(os.homedir(), '.yourca', 'mempalace');
const DB_PATH = path.join(BASE, 'mempalace.lance');
const TABLE = 'mempalace_drawers';
const KG_PATH = path.join(BASE, 'knowledge.db');
const IDENTITY_PATH = path.join(BASE, 'identity.md');

// ─── CJK-safe chunkText ───

function safeChunkText(text: string): Array<{ content: string; chunkIndex: number }> {
  if (!text) return [];
  const r = mempalaceChunkText(text);
  if (r.length > 0) return r;
  const max = 400;
  if (text.length <= max) return [{ content: text, chunkIndex: 0 }];
  const chunks: Array<{ content: string; chunkIndex: number }> = [];
  let start = 0; let idx = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const w = text.slice(Math.max(0, end - 60), end);
      const bp = Math.max(w.lastIndexOf('。'), w.lastIndexOf('\n'));
      if (bp > 5) end = Math.max(start + 1, end - 60 + bp + 1);
    }
    chunks.push({ content: text.slice(start, end).trim(), chunkIndex: idx++ });
    start = end - 80;
  }
  return chunks.filter(c => c.content.length > 0);
}

// ─── Singletons ───

let _config: MempalaceConfig | null = null;
let _storage: VectorStorage | null = null;
let _stack: MemoryStack | null = null;
let _kg: KnowledgeGraph | null = null;
let _ready = false;
let _currentWing = 'default';

function ensureDir() { if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true }); }
function getConfig(): MempalaceConfig { if (!_config) { ensureDir(); _config = new MempalaceConfig(BASE); } return _config; }

export function generateDrawerId(wing: string, room: string, content: string, chunkIndex: number): string {
  let h = 0; const s = `${wing}|${room}|${content}|${chunkIndex}`;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return `${wing}_${room}_${Math.abs(h).toString(36)}`;
}

export function detectProjectWing(dir?: string): string {
  const cwd = dir ?? process.cwd();
  try {
    const gitDir = path.join(cwd, '.git');
    if (fs.existsSync(gitDir)) {
      const raw = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
      const m = raw.match(/\[remote "origin"\][\s\S]*?url\s*=\s*.+?\/([^/]+?)\.git/);
      if (m?.[1]) return (m[1].split('/').pop() ?? m[1]).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
  } catch {}
  return path.basename(cwd).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

export function detectHall(content: string): string {
  const lower = content.toLowerCase();
  for (const [hall, kws] of Object.entries(DEFAULT_HALL_KEYWORDS)) {
    for (const kw of kws) { if (lower.includes(kw.toLowerCase())) return hall; }
  }
  return 'general';
}

export function setCurrentWing(wing: string): void { _currentWing = wing; }
export function getCurrentWing(): string { return _currentWing; }

// ─── Init ───

export async function initMempalace(options?: { l0Identity?: string; wing?: string }): Promise<void> {
  if (_ready) return;
  ensureDir();
  try { fs.writeFileSync(IDENTITY_PATH, options?.l0Identity ?? 'You are YourCA.', 'utf-8'); } catch {}
  _storage = new VectorStorage(DB_PATH, TABLE);
  await _storage.init();
  _stack = new MemoryStack(getConfig(), _storage);
  _kg = new KnowledgeGraph(KG_PATH);
  _currentWing = options?.wing ?? detectProjectWing();
  _ready = true;
}

export function isReady(): boolean { return _ready; }
export async function getStorage(): Promise<VectorStorage> { if (!_ready) await initMempalace(); return _storage!; }
export async function getStack(): Promise<MemoryStack> { if (!_ready) await initMempalace(); return _stack!; }
export async function getKG(): Promise<KnowledgeGraph> { if (!_ready) await initMempalace(); return _kg!; }

export async function wakeUp(wing?: string): Promise<string> { return (await getStack()).wakeUp(wing); }
export async function recall(wing?: string, room?: string, n?: number): Promise<string> { return (await getStack()).recall(wing, room, n); }
export async function deepSearch(query: string, wing?: string, room?: string, n?: number): Promise<string> { return (await getStack()).search(query, wing, room, n); }

// ─── Store ───

export async function storeMemory(content: string, options?: { wing?: string; room?: string; tags?: string[] }): Promise<string[]> {
  const s = await getStorage();
  const wing = options?.wing ?? _currentWing;
  const room = options?.room ?? 'conversation';
  const hall = detectHall(content);
  const now = new Date().toISOString();
  const chunks = safeChunkText(content);
  if (chunks.length === 0) return [];

  const drawers: Drawer[] = chunks.map(c => ({
    id: generateDrawerId(wing, room, c.content, c.chunkIndex),
    content: c.content, wing, room, hall,
    sourceFile: options?.tags?.join(',') ?? '',
    chunkIndex: c.chunkIndex, addedBy: 'yourca', filedAt: now,
    type: 'memory', agent: 'yourca', date: now.split('T')[0],
  }));
  await s.upsertDrawers(drawers);
  // upsertDrawers computes embeddings for drawers without vector

  try {
    const kg = await getKG();
    const { detectEntities } = await import('@mempalace/core');
    for (const [name, count] of detectEntities(content)) {
      kg.addEntity(name, count > 3 ? 'concept' : 'unknown', { mentions: count, source: 'yourca' });
    }
  } catch {}
  return drawers.map(d => d.id);
}

export async function autoSave(text: string): Promise<void> {
  if (!text.trim()) return;
  await storeMemory(text, { wing: _currentWing, room: 'conversation' });
}

// ─── Search ───

export async function searchMemories(query: string, limit = 10, filter?: { wing?: string; room?: string }): Promise<Array<{ chunk: Drawer; score: number }>> {
  return (await getStorage()).search(query, limit, filter).then(r => r.map(x => ({ chunk: x, score: x.similarity })));
}

export async function getWingStats(): Promise<{ wings: Record<string, number>; rooms: Record<string, number>; total: number }> {
  return (await getStorage()).getTaxonomy();
}

// ─── RAG ───

export async function buildRagContext(query: string, maxRes = 5, maxTok = 3000): Promise<string> {
  const results = await searchMemories(query, maxRes);
  if (!results.length) return '';
  const p: string[] = ['## Relevant Memories\n']; let tok = 0;
  for (const r of results) {
    const age = r.chunk.filedAt ? `${Math.floor((Date.now() - new Date(r.chunk.filedAt).getTime()) / 86400000)}d` : '?';
    const t = `[${p.length}] (${age}, ${r.chunk.hall ?? r.chunk.wing}, ${Math.round(r.score * 100)}%)\n${r.chunk.content.slice(0, 500)}\n`;
    const c = Math.ceil(t.length / 3.5);
    if (maxTok && tok + c > maxTok) break;
    p.push(t); tok += c;
  }
  return p.join('\n');
}

export async function enhanceSystemPrompt(base: string, query: string): Promise<string> {
  const rag = await buildRagContext(query);
  return rag ? `${base}\n\n${rag}` : base;
}

// ─── Stats ───

export function getMemoryStats(): { vectorSizeKB: number } {
  try { return { vectorSizeKB: Math.ceil(fs.statSync(DB_PATH).size / 1024) }; } catch { return { vectorSizeKB: 0 }; }
}

export function clearMemories(): void {
  _storage = null; _stack = null; _kg = null; _config = null; _ready = false;
  try { fs.rmSync(BASE, { recursive: true, force: true }); } catch {}
}
