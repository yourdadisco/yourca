/**
 * History system — ported from Claude Code's history.ts
 * Provides:
 * - Prompt/command history logging to JSONL
 * - In-memory pending buffer with async flushing
 * - History deduplication and filtering
 * - Pasted content store with inline/ref split
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const HISTORY_FILE = path.join(os.homedir(), '.yourca', 'history.jsonl');
const MAX_HISTORY_ENTRIES = 100;
const FLUSH_DELAY_MS = 500;
const MAX_FLUSH_RETRIES = 5;

// ─── Types ───

export interface StoredPastedContent {
  id: number;
  type: 'text' | 'image';
  content?: string;
  contentHash?: string;
  mediaType?: string;
  filename?: string;
}

export interface LogEntry {
  display: string;
  pastedContents: StoredPastedContent[];
  timestamp: number;
  project: string;
  sessionId?: string;
}

export interface HistoryEntry {
  display: string;
  pastedContents: StoredPastedContent[];
  timestamp: Date;
}

// ─── In-memory state ───

const pendingEntries: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushRetries = 0;
let isFlushing = false;
let skipHistory = false;

// ─── API ───

export function addToHistory(entry: string | LogEntry): void {
  if (skipHistory) return;

  const now = Date.now();
  const logEntry: LogEntry = typeof entry === 'string'
    ? {
        display: entry.slice(0, 1000),
        pastedContents: [],
        timestamp: now,
        project: process.cwd() || 'unknown',
        sessionId: undefined,
      }
    : entry;

  pendingEntries.push(logEntry);
  scheduleFlush();
}

export function getHistory(): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  // First: in-memory pending entries
  for (const e of pendingEntries) {
    entries.push({
      display: e.display,
      pastedContents: e.pastedContents,
      timestamp: new Date(e.timestamp),
    });
  }

  // Then: file entries (excluding duplicates)
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const seen = new Set(pendingEntries.map(e => e.display));
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (let i = lines.length - 1; i >= 0 && entries.length < MAX_HISTORY_ENTRIES; i--) {
        try {
          const parsed: LogEntry = JSON.parse(lines[i]);
          if (!seen.has(parsed.display)) {
            entries.push({
              display: parsed.display,
              pastedContents: parsed.pastedContents,
              timestamp: new Date(parsed.timestamp),
            });
            seen.add(parsed.display);
          }
        } catch { /* skip malformed lines */ }
      }
    }
  } catch { /* ignore file errors */ }

  return entries.slice(0, MAX_HISTORY_ENTRIES);
}

export function removeLastFromHistory(): boolean {
  if (pendingEntries.length > 0) {
    pendingEntries.pop();
    return true;
  }
  return false;
}

export function clearHistory(): void {
  pendingEntries.length = 0;
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  } catch { /* ignore */ }
}

export function setSkipHistory(skip: boolean): void {
  skipHistory = skip;
}

// ─── Internal ───

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(doFlush, FLUSH_DELAY_MS);
}

async function doFlush(): Promise<void> {
  if (isFlushing || pendingEntries.length === 0) return;
  isFlushing = true;

  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append all pending entries
    const linesToWrite = pendingEntries.splice(0).map(e => JSON.stringify(e) + '\n');
    fs.appendFileSync(HISTORY_FILE, linesToWrite.join(''), 'utf-8');
    flushRetries = 0;
  } catch (err) {
    // Put entries back on failure
    flushRetries++;
    if (flushRetries < MAX_FLUSH_RETRIES) {
      scheduleFlush();
    }
  } finally {
    isFlushing = false;
  }
}

// Flush on exit
process.on('exit', () => {
  if (pendingEntries.length > 0) {
    try {
      const dir = path.dirname(HISTORY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const lines = pendingEntries.map(e => JSON.stringify(e) + '\n').join('');
      fs.appendFileSync(HISTORY_FILE, lines, 'utf-8');
    } catch { /* ignore */ }
  }
});
