/**
 * MemPalace integration — YourCA's vector memory backend.
 * Uses LanceDB directly for vector search. @mempalace/core for KG + utilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as lancedb from '@lancedb/lancedb';

import { KnowledgeGraph, MempalaceConfig, DEFAULT_HALL_KEYWORDS } from '@mempalace/core';

const BASE = path.join(os.homedir(), '.yourca', 'mempalace');
const DB_PATH = path.join(BASE, 'mempalace.lance');
const TABLE = 'mempalace_drawers';
const KG_PATH = path.join(BASE, 'knowledge.db');
const IDENTITY_PATH = path.join(BASE, 'identity.md');
const DIM = 384;

// ─── Custom safe chunkText (CJK-compatible) ───

function safeChunkText(text: string): Array<{ content: string; chunkIndex: number }> {
  if (!text || text.length === 0) return [];
  const maxLen = 400;
  if (text.length <= maxLen) return [{ content: text, chunkIndex: 0 }];
  const result: Array<{ content: string; chunkIndex: number }> = [];
  let start = 0; let idx = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const win = text.slice(Math.max(0, end - 60), end);
      const dot = Math.max(win.lastIndexOf('。'), win.lastIndexOf('\n'));
      if (dot > 5) end = Math.max(start + 1, end - 60 + dot + 1);
    }
    result.push({ content: text.slice(start, end).trim(), chunkIndex: idx++ });
    start = end - 80;
  }
  return result.filter(c => c.content.length > 0);
}

// ─── Local Embedding ───

export function localEmbed(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) { h = ((h << 5) - h) + t.charCodeAt(i); h |= 0; }
    const idx = Math.abs(h) % DIM;
    vec[idx] += 1;
    for (let j = 1; j <= 3; j++) vec[(idx + j) % DIM] += 0.5 / j;
  }
  let mag = 0;
  for (let i = 0; i < DIM; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < DIM; i++) vec[i] /= mag;
  return vec;
}

// ─── Database ───

let _db: lancedb.Connection | null = null;
let _kg: KnowledgeGraph | null = null;
let _ready = false;
let _currentWing = 'default';

function ensureDir() { if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true }); }

async function openTable(): Promise<lancedb.Table> {
  if (!_db) {
    ensureDir();
    _db = await lancedb.connect(DB_PATH);
    const names = await _db.tableNames();
    if (!names.includes(TABLE)) {
      await _db.createTable(TABLE, [{
        id: '_init', vector: new Array(DIM).fill(0.01),
        content: 'init', wing: '_', room: '_',
        sourceFile: '', chunkIndex: 0, addedBy: '',
        filedAt: new Date().toISOString(),
        hall: '', topic: '', type: '', agent: '', date: '',
      }]);
    }
  }
  return _db.openTable(TABLE);
}

// ─── Utilities ───

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
  await openTable();
  _kg = new KnowledgeGraph(KG_PATH);
  _currentWing = options?.wing ?? detectProjectWing();
  _ready = true;
}

export function isReady(): boolean { return _ready; }

// ─── Store ───

export async function storeMemory(content: string, options?: { wing?: string; room?: string; tags?: string[] }): Promise<string[]> {
  const t = await openTable();
  const wing = options?.wing ?? _currentWing;
  const room = options?.room ?? 'conversation';
  const hall = detectHall(content);
  const now = new Date().toISOString();
  const chunks = safeChunkText(content);
  if (chunks.length === 0) return [];

  const rows = chunks.map(c => ({
    id: generateDrawerId(wing, room, c.content, c.chunkIndex),
    content: c.content, wing, room, hall,
    sourceFile: options?.tags?.join(',') ?? '', chunkIndex: c.chunkIndex,
    addedBy: 'yourca', filedAt: now,
    vector: localEmbed(c.content),
    type: 'memory', agent: 'yourca', date: now.split('T')[0],
  }));
  await t.add(rows as any);

  try {
    const kg = _kg ?? new KnowledgeGraph(KG_PATH);
    const { detectEntities } = await import('@mempalace/core');
    for (const [name, count] of detectEntities(content)) {
      kg.addEntity(name, count > 3 ? 'concept' : 'unknown', { mentions: count, source: 'yourca' });
    }
  } catch {}
  return rows.map(r => r.id);
}

export async function autoSave(text: string): Promise<void> {
  if (!text.trim()) return;
  await storeMemory(text, { wing: _currentWing, room: 'conversation' });
}

// ─── Search ───

export async function searchMemories(query: string, limit = 10, filter?: { wing?: string; room?: string }): Promise<Array<{ chunk: any; score: number }>> {
  const t = await openTable();
  const qv = localEmbed(query);
  let q = t.query().nearestTo(qv).limit(limit);
  if (filter?.wing) q = q.where(`wing = '${filter.wing}'`);
  if (filter?.room) q = q.where(`room = '${filter.room}'`);
  const results = await q.toArray();
  // Filter out internal seed records
  return results.filter((r: any) => r.id !== '_init' && r.wing !== '_').map((r: any) => ({
    chunk: r,
    score: parseFloat((1 - (r._distance ?? 0) ** 2 / 2).toFixed(3)),
  }));
}

export async function getWingStats(): Promise<{ wings: Record<string, number>; rooms: Record<string, number>; total: number }> {
  const t = await openTable();
  const all = await t.query().select(['wing', 'room']).toArray() as any[];
  const w: Record<string, number> = {}; const r: Record<string, number> = {};
  for (const x of all) {
    if (x.wing && x.wing !== '_') w[x.wing] = (w[x.wing] ?? 0) + 1;
    if (x.room && x.room !== '_') r[x.room] = (r[x.room] ?? 0) + 1;
  }
  return { wings: w, rooms: r, total: all.filter((x: any) => x.id !== '_init').length };
}

// ─── RAG ───

export async function buildRagContext(query: string, maxRes = 5, maxTok = 3000): Promise<string> {
  const results = await searchMemories(query, maxRes);
  if (!results.length) return '';
  const p: string[] = ['## Relevant Memories\n']; let tok = 0;
  for (const r of results) {
    if (r.chunk.id === '_init') continue;
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

export function getMemoryStats(): { sizeKB: number } {
  try { return { sizeKB: Math.ceil(fs.statSync(DB_PATH).size / 1024) }; } catch { return { sizeKB: 0 }; }
}

export function clearMemories(): void {
  _db = null; _kg = null; _ready = false;
  try { fs.rmSync(BASE, { recursive: true, force: true }); } catch {}
}
