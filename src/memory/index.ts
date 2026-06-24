/**
 * Dual-track Memory System — MEMDIR + Vector Memory (RAG + Embedding).
 *
 * MEMDIR (Claude Code native):
 *   - Markdown files, human-readable, MEMORY.md index
 *   - Used for: short/medium-term (~25KB prompt budget)
 *   - Always in context (MEMORY.md loaded at session start)
 *   - Model writes/reads via tools (Write, Read, Edit)
 *
 * Vector Memory (MemPalace-compatible):
 *   - RAG pipeline: chunk → embed → store → retrieve → inject
 *   - Hybrid search: vector (cosine) + keyword (BM25)
 *   - Pluggable embedding backends: DeepSeek API / local fallback
 *   - Auto-chunking with overlap, temporal decay scoring
 *   - Used for: long-term, semantic search across all memories
 *
 * INTEGRATION:
 *   - MEMDIR content also auto-indexed into Vector Memory
 *   - buildRagContext() injects relevant memories into system prompt
 *   - Pre-compact hook saves current context to vector store
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getProjectRoot } from '../state/bootstrap.js';
import {
  storeMemory,
  searchMemories,
  getMemoryStats as getVectorStats,
  getAllMemories,
  normalizeContent,
  buildRagContext,
  enhanceSystemPrompt,
  clearMemories,
  setEmbeddingProvider,
  type MemoryChunk,
  type SearchHit,
} from '../services/vectorMemory/index.js';

// ─── MEMDIR Types (Claude Code native) ───

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export function parseMemoryType(raw: string): MemoryType | undefined {
  const normalized = raw.toLowerCase().trim() as MemoryType;
  return MEMORY_TYPES.includes(normalized) ? normalized : undefined;
}

// ─── MEMDIR Paths ───

export const ENTRYPOINT_NAME = 'MEMORY.md';
export const MAX_ENTRYPOINT_LINES = 200;
export const MAX_ENTRYPOINT_BYTES = 25_000;

export function getMemoryBaseDir(): string {
  const homeDir = os.homedir();
  const baseDir = path.join(homeDir, '.yourca', 'memory');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

export function getAutoMemPath(): string {
  const projectRoot = getProjectRoot();
  const projectSlug = projectRoot.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return path.join(getMemoryBaseDir(), 'projects', projectSlug, 'memory');
}

export function getAutoMemEntrypoint(): string {
  return path.join(getAutoMemPath(), ENTRYPOINT_NAME);
}

export function ensureMemoryDirExists(dir?: string): string {
  const memoryDir = dir ?? getAutoMemPath();
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  return memoryDir;
}

// ─── MEMORY.md Management ───

export interface EntrypointTruncation {
  content: string;
  lineCount: number;
  byteCount: number;
  wasLineTruncated: boolean;
  wasByteTruncated: boolean;
}

export function truncateEntrypointContent(raw: string): EntrypointTruncation {
  const lines = raw.split('\n');
  const wasLineTruncated = lines.length > MAX_ENTRYPOINT_LINES;
  const truncated = wasLineTruncated
    ? lines.slice(0, MAX_ENTRYPOINT_LINES).join('\n') + '\n... (truncated: too many lines)'
    : raw;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(truncated);
  const wasByteTruncated = bytes.length > MAX_ENTRYPOINT_BYTES;

  if (wasByteTruncated) {
    const trimmed = new TextDecoder().decode(bytes.slice(0, MAX_ENTRYPOINT_BYTES));
    const lastNewline = trimmed.lastIndexOf('\n');
    return {
      content: trimmed.slice(0, lastNewline > 0 ? lastNewline : MAX_ENTRYPOINT_BYTES) + '\n... (truncated: too large)',
      lineCount: lines.length,
      byteCount: bytes.length,
      wasLineTruncated,
      wasByteTruncated,
    };
  }

  return {
    content: truncated,
    lineCount: lines.length,
    byteCount: bytes.length,
    wasLineTruncated,
    wasByteTruncated,
  };
}

export function readMemoryIndex(): EntrypointTruncation | null {
  const entrypoint = getAutoMemEntrypoint();
  if (!fs.existsSync(entrypoint)) return null;

  try {
    const content = fs.readFileSync(entrypoint, 'utf-8');
    return truncateEntrypointContent(content);
  } catch {
    return null;
  }
}

export function appendMemoryIndex(line: string): boolean {
  const entrypoint = getAutoMemEntrypoint();
  try {
    const dir = path.dirname(entrypoint);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(entrypoint, line + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ─── MEMDIR + Vector Memory Integration ───

/**
 * Save a memory to BOTH MEMDIR (if readable) and Vector Memory (always).
 * MEMDIR: writes a markdown file + appends to MEMORY.md index
 * Vector: chunks + embeds + indexes content for RAG search
 */
export async function saveMemory(options: {
  name: string;
  description: string;
  content: string;
  type: MemoryType;
  tags?: string[];
}): Promise<{ memdirPath?: string; vectorIds?: string[] }> {
  const result: { memdirPath?: string; vectorIds?: string[] } = {};

  // 1. Save to Vector Memory (RAG pipeline: chunk → embed → store)
  result.vectorIds = await storeMemory(options.content, {
    source: 'memdir',
    category: options.type === 'user' ? 'preference' :
              options.type === 'feedback' ? 'decision' :
              options.type === 'reference' ? 'reference' : 'fact',
    tags: ['memdir', ...(options.tags ?? []), options.type],
    projectSlug: 'default',
  });

  // 2. Save to MEMDIR (markdown file + index)
  try {
    const memPath = getAutoMemPath();
    ensureMemoryDirExists(memPath);

    const frontmatter = `---
name: ${options.name}
description: ${options.description}
metadata:
  type: ${options.type}
---

`;

    const filePath = path.join(memPath, `${options.name}.md`);
    fs.writeFileSync(filePath, frontmatter + options.content, 'utf-8');
    result.memdirPath = filePath;

    // Append to MEMORY.md index
    const indexLine = `- [${options.name}](${options.name}.md) — ${options.description}`;
    appendMemoryIndex(indexLine);
  } catch {
    // MEMDIR is best-effort; vector memory is the canonical store
  }

  return result;
}

/**
 * Delete a memory from both stores.
 */
export function deleteMemory(name: string): boolean {
  let removed = false;

  // Remove from MEMDIR
  try {
    const filePath = path.join(getAutoMemPath(), `${name}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed = true;
    }
    // Also remove from MEMORY.md (simple: rewrite without the line)
    const entrypoint = getAutoMemEntrypoint();
    if (fs.existsSync(entrypoint)) {
      const content = fs.readFileSync(entrypoint, 'utf-8');
      const lines = content.split('\n').filter(line => !line.includes(`](${name}.md)`));
      fs.writeFileSync(entrypoint, lines.join('\n'), 'utf-8');
    }
  } catch {
    // Best-effort
  }

  return removed;
}

/**
 * Search across BOTH memory systems.
 * Vector Memory uses hybrid search (cosine similarity + BM25 + temporal decay).
 * MEMDIR grep fallback for exact matches.
 */
export async function searchAllMemories(
  query: string,
  limit: number = 10,
): Promise<{ vectorResults: SearchHit[]; memdirResults: string[] }> {
  // Vector memory hybrid search
  const vectorResults = await searchMemories(query, limit);

  // MEMDIR grep fallback
  const memdirResults: string[] = [];
  try {
    const memPath = getAutoMemPath();
    if (fs.existsSync(memPath)) {
      const files = fs.readdirSync(memPath).filter(f => f.endsWith('.md'));
      const terms = query.toLowerCase().split(/\s+/);
      for (const file of files) {
        const content = fs.readFileSync(path.join(memPath, file), 'utf-8');
        if (terms.some(t => content.toLowerCase().includes(t))) {
          const name = file.replace(/\.md$/, '');
          const descMatch = content.match(/description:\s*(.+)/);
          memdirResults.push(`- [${name}](${file})${descMatch ? ` — ${descMatch[1]}` : ''}`);
        }
      }
    }
  } catch {
    // Best-effort
  }

  return { vectorResults, memdirResults };
}

/**
 * Build the unified memory prompt for system prompt injection.
 * Combines MEMDIR index (always loaded) + RAG vector memory context (on-demand query).
 */
export async function buildMemoryPrompt(
  displayName?: string,
  query?: string,
): Promise<string> {
  ensureMemoryDirExists();
  const memPath = getAutoMemPath();
  const name = displayName ?? 'YourCA';

  const parts: string[] = [
    `## Memory System (Dual-Track: MEMDIR + RAG Vector Store)`,
    ``,
    `${name} has two memory systems working together:`,
    ``,
    `**1. File Memory (MEMDIR)** — \`${memPath}\``,
    `   Human-readable markdown files, always partially loaded in context.`,
    `   Each file has YAML frontmatter with type: user \| feedback \| project \| reference.`,
    `   Use Write/Read/Edit tools to manage these files directly.`,
    ``,
    `**2. RAG Vector Memory** — Auto-chunked, embedded, hybrid search.`,
    `   Conversations and file memories are automatically indexed.`,
    `   Retrieves relevant chunks via semantic similarity + BM25 keyword.`,
    `   Inject result: via buildRagContext() into system prompt.`,
    ``,
    `Rules for saving to MEMDIR:`,
    `- Use \`Write\` to create memory files with YAML frontmatter`,
    `- Append one-line pointer to MEMORY.md when creating`,
    `- Use \`Edit\` to update existing memories`,
    `- Link with [[name]] cross-references`,
    ``,
    `### What NOT to save`,
    `- Code patterns or implementations already in the project`,
    `- Git history (derivable from the repo)`,
    `- CLAUDE.md content (already in context)`,
    `- Ephemeral task details`,
    ``,
    `### When to access memory`,
    `- When the user asks about past conversations or decisions`,
    `- When you need context about preferences or workflow`,
    `- When starting a new session`,
    ``,
    `Memory can become stale — verify critical information against current state.`,
  ];

  // Try to include existing MEMORY.md content
  const existing = readMemoryIndex();
  if (existing) {
    parts.push('', '## Existing File Memories', existing.content);
  }

  // Add RAG vector memory context if query provided
  if (query) {
    const ragContext = await buildRagContext(query, 5);
    if (ragContext) {
      parts.push('', ragContext);
    }
  }

  return parts.join('\n');
}

/**
 * Pre-compact hook: save important context to vector memory before compaction.
 * This ensures information survives compact via RAG retrieval.
 */
export async function savePreCompactContext(
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  const userMessages: string[] = [];
  const assistantSummaries: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && msg.content) {
      userMessages.push(msg.content);
    } else if (msg.role === 'assistant' && msg.content) {
      assistantSummaries.push(msg.content);
    }
  }

  // Save condensed version to vector memory (RAG pipeline)
  const recentUserContent = userMessages.slice(-3).join('\n---\n');
  const recentAssistantContent = assistantSummaries.slice(-3).join('\n---\n');

  if (recentUserContent) {
    await storeMemory(recentUserContent, {
      category: 'fact',
      tags: ['pre-compact', 'user-requests'],
    });
  }

  if (recentAssistantContent) {
    await storeMemory(recentAssistantContent, {
      category: 'fact',
      tags: ['pre-compact', 'assistant-response'],
    });
  }
}

/**
 * Statistics about both memory systems.
 */
export function getMemoryStats(): {
  memdirFileCount: number;
  vectorEntryCount: number;
  vectorEmbeddedCount: number;
  totalEstimatedTokens: number;
} {
  let memdirFileCount = 0;
  let memdirTotalBytes = 0;

  try {
    const memPath = getAutoMemPath();
    if (fs.existsSync(memPath)) {
      const files = fs.readdirSync(memPath).filter(f => f.endsWith('.md'));
      memdirFileCount = files.length;
      for (const file of files) {
        try {
          memdirTotalBytes += fs.statSync(path.join(memPath, file)).size;
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  const vStats = getVectorStats();

  return {
    memdirFileCount,
    vectorEntryCount: vStats.count,
    vectorEmbeddedCount: vStats.embedded,
    totalEstimatedTokens: Math.ceil(memdirTotalBytes / 3.5) + vStats.count * 100,
  };
}

export function isAutoMemoryEnabled(): boolean {
  if (process.env.YOURCA_DISABLE_AUTO_MEMORY === '1') return false;
  return true;
}
