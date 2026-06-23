/**
 * Memory system — ported from Claude Code's memdir system.
 * Provides:
 * - Memory directory path resolution
 * - Memory types taxonomy (user/feedback/project/reference)
 * - MEMORY.md index management
 * - Memory saving and retrieval prompts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getProjectRoot } from '../state/bootstrap.js';

// ─── Memory Types ───

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export function parseMemoryType(raw: string): MemoryType | undefined {
  const normalized = raw.toLowerCase().trim() as MemoryType;
  return MEMORY_TYPES.includes(normalized) ? normalized : undefined;
}

// ─── Memory Paths ───

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
  const memPath = path.join(getMemoryBaseDir(), 'projects', projectSlug, 'memory');
  return memPath;
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

// ─── Memory Prompt Sections ───

export const MEMORY_FRONTMATTER_EXAMPLE = `---
name: <short-kebab-case-slug>
description: <one-line summary>
metadata:
  type: user | feedback | project | reference
---`;

export const WHAT_NOT_TO_SAVE_SECTION = `## What NOT to save
- Code patterns or implementations (these are in the project itself)
- Git history (derivable from the repo)
- Debugging solutions you just implemented (already in the code)
- CLAUDE.md content (already in context)
- Ephemeral task details (only useful for the current conversation)`;

export const WHEN_TO_ACCESS_SECTION = `## When to access memory
- When the user asks about past conversations or decisions
- When you need context about the user's preferences or workflow
- When starting a new session and need to re-establish context
- When the user asks "what were we working on?"`;

export const MEMORY_DRIFT_CAVEAT = 'Memory records can become stale over time. Always verify critical information against the current state of the project.';

// ─── Memory Prompt Builder ───

export function buildMemoryPrompt(displayName?: string): string {
  ensureMemoryDirExists();
  const memPath = getAutoMemPath();
  const name = displayName ?? 'YourCA';

  const parts: string[] = [
    `## Memory System`,
    ``,
    `${name} has a persistent file-based memory at \`${memPath}\`.`,
    `Each memory is one file holding one fact, with YAML frontmatter:`,
    ``,
    MEMORY_FRONTMATTER_EXAMPLE,
    ``,
    `Memory types:`,
    `- **user** — Who the user is (role, expertise, preferences)`,
    `- **feedback** — Guidance on how to work (corrections, confirmed approaches)`,
    `- **project** — Ongoing work, goals, constraints not in code or git`,
    `- **reference** — External resources (URLs, documentation)`,
    ``,
    `Rules:`,
    `- Use \`Write\` to create new memory files`,
    `- Use \`Edit\` to update existing memory (the file path IS the canonical link)`,
    `- Use \`Read\` to load a memory's content`,
    `- The \`MEMORY.md\` file in the memory directory is the INDEX — append a one-line pointer when you write a new memory`,
    `- Memories are organized by topic, not chronologically`,
    `- Link related memories with [[name]] in the body`,
    ``,
    WHAT_NOT_TO_SAVE_SECTION,
    ``,
    WHEN_TO_ACCESS_SECTION,
    ``,
    MEMORY_DRIFT_CAVEAT,
  ];

  // Try to include existing MEMORY.md content
  const existing = readMemoryIndex();
  if (existing) {
    parts.push('', '## Existing memories', existing.content);
  }

  return parts.join('\n');
}

export function isAutoMemoryEnabled(): boolean {
  // Check env var
  if (process.env.YOURCA_DISABLE_AUTO_MEMORY === '1') return false;
  return true;
}
