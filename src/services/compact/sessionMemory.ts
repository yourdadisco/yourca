/**
 * L2: Session Memory — background conversation memory extraction and compact-time reuse.
 *
 * DESIGN PATTERN: cost amortization.
 * - EXTRACTION: runs in background (post-turn hook), calls LLM to update a structured
 *   markdown file with session context. This costs tokens but happens incrementally.
 * - COMPACTION: at compact time, reads the pre-extracted file. Zero API cost at compact time.
 *
 * Ported from Claude Code's sessionMemory.ts + sessionMemoryCompact.ts concepts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Message } from '../../tool/Tool.js';
import { estimateMessagesTokens } from './grouping.js';

const SESSION_MEMORY_DIR = path.join(os.homedir(), '.yourca', 'session-memory');
const SESSION_MEMORY_FILE = path.join(SESSION_MEMORY_DIR, 'SESSION_MEMORY.md');

export const DEFAULT_TEMPLATE = `# Session Title
_A short distinctive title for the session_

# Current State
_What is being worked on right now? Immediate next steps._

# Task Specification
_What did the user ask to build? Design decisions._

# Files and Functions
_Important files, what they contain, why they're relevant._

# Errors & Corrections
_Errors encountered and how they were fixed. What to avoid._

# Key Results
_Specific outputs the user requested (answers, tables, code)._

# Worklog
_Step-by-step summary of what was attempted and done._
`;

const MIN_TOKENS_TO_INIT = 8_000;
const MIN_TOKENS_BETWEEN_UPDATES = 4_000;
const TOOL_CALLS_BETWEEN_UPDATES = 3;
const MAX_SECTION_TOKENS = 2000;
const MAX_TOTAL_TOKENS = 12_000;
const EXTRACTION_TIMEOUT = 15_000;

// ─── Module State ───

let lastExtractionTokenCount = 0;
let extractionInProgress = false;
let sessionMemoryInitialized = false;

// ─── File Operations ───

function ensureSessionMemoryFile(): void {
  if (!fs.existsSync(SESSION_MEMORY_DIR)) {
    fs.mkdirSync(SESSION_MEMORY_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSION_MEMORY_FILE)) {
    fs.writeFileSync(SESSION_MEMORY_FILE, DEFAULT_TEMPLATE, 'utf-8');
  }
}

export function getSessionMemoryContent(): string {
  ensureSessionMemoryFile();
  try {
    return fs.readFileSync(SESSION_MEMORY_FILE, 'utf-8');
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export function writeSessionMemoryContent(content: string): void {
  ensureSessionMemoryFile();
  fs.writeFileSync(SESSION_MEMORY_FILE, content, 'utf-8');
}

export function isSessionMemoryEmpty(): boolean {
  const content = getSessionMemoryContent();
  return content.trim() === DEFAULT_TEMPLATE.trim();
}

export function isSessionMemoryInitialized(): boolean {
  return sessionMemoryInitialized;
}

// ─── Truncation ───

export function truncateSessionMemoryForCompact(content: string): { truncated: string; wasTruncated: boolean } {
  const lines = content.split('\n');
  const maxChars = MAX_SECTION_TOKENS * 4;
  const output: string[] = [];
  let currentSection: string[] = [];
  let currentHeader = '';
  let wasTruncated = false;

  function flushSection() {
    if (!currentHeader) return;
    const sectionContent = currentSection.join('\n');
    if (sectionContent.length > maxChars) {
      const kept: string[] = [currentHeader];
      let charCount = 0;
      for (const line of currentSection) {
        if (charCount + line.length + 1 > maxChars) break;
        kept.push(line);
        charCount += line.length + 1;
      }
      kept.push('\n[... (truncated for compact budget)]');
      output.push(...kept);
      wasTruncated = true;
    } else {
      output.push(currentHeader, ...currentSection);
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushSection();
      currentHeader = line;
      currentSection = [];
    } else {
      currentSection.push(line);
    }
  }
  flushSection();

  return { truncated: output.join('\n'), wasTruncated };
}

// ─── Extraction Threshold Checks ───

export function shouldExtractMemory(messages: Message[]): boolean {
  const currentTokens = estimateMessagesTokens(messages);

  if (!sessionMemoryInitialized) {
    if (currentTokens < MIN_TOKENS_TO_INIT) return false;
    sessionMemoryInitialized = true;
  }

  const tokenGrowth = currentTokens - lastExtractionTokenCount;
  if (tokenGrowth < MIN_TOKENS_BETWEEN_UPDATES) return false;

  // Check tool calls
  const toolCallCount = messages.reduce((count, msg) => {
    if (msg.role === 'assistant') {
      return count + msg.content.filter(c => c.type === 'tool_use').length;
    }
    return count;
  }, 0);

  if (toolCallCount < TOOL_CALLS_BETWEEN_UPDATES) return false;

  return true;
}

export async function waitForSessionMemoryExtraction(): Promise<void> {
  if (!extractionInProgress) return;
  const start = Date.now();
  while (extractionInProgress) {
    if (Date.now() - start > EXTRACTION_TIMEOUT) break;
    await new Promise(r => setTimeout(r, 100));
  }
}

// ─── Extraction Prompt ───

export function buildExtractionPrompt(currentMemory: string): string {
  return `Based on the conversation above, update the session notes file.

Current notes content:
${currentMemory}

CRITICAL RULES:
1. Preserve all section headers (#) and italic descriptions — DO NOT modify them
2. ONLY update the content BELOW each section's italic description
3. Keep each section under ~${MAX_SECTION_TOKENS} tokens
4. Total file must stay under ~${MAX_TOTAL_TOKENS} tokens
5. Focus on: Current State, Errors & Corrections, Key Results
6. Update "Current State" to reflect the MOST RECENT work

Use the Edit tool to update the file. Make all edits in parallel. Stop after editing.`;
}

export function buildSessionMemorySummaryMessage(
  sessionMemory: string,
  messagesToKeepCount: number,
): string {
  const { truncated } = truncateSessionMemoryForCompact(sessionMemory);
  return `This session continues from earlier work. Here's a summary:

${truncated}

${messagesToKeepCount > 0
    ? `\nThe last ${messagesToKeepCount} messages are preserved below.`
    : ''}

If you need details from before compaction, ask the user.`;
}

export function recordExtraction(tokenCount: number): void {
  lastExtractionTokenCount = tokenCount;
}
