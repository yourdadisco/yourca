/**
 * Enterprise context builder — ported from Claude Code's context.ts
 * Provides:
 * - Memoized git context (branch, status, recent commits, username)
 * - CLAUDE.md loading with project detection
 * - System prompt builder with caching
 * - Current date injection
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { getProjectRoot } from '../state/bootstrap.js';

// ---- Git context with memoization ----

interface GitStatus {
  status: string;
  branch: string;
  mainBranch: string;
  log: string;
  userName: string | null;
}

let cachedGitStatus: GitStatus | null = null;
let gitStatusCacheTime = 0;
const GIT_CACHE_TTL = 30_000; // 30 seconds

function execNoThrow(cmd: string, defaultValue = ''): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return defaultValue;
  }
}

function getGitStatus(): GitStatus | null {
  const now = Date.now();
  if (cachedGitStatus && (now - gitStatusCacheTime) < GIT_CACHE_TTL) {
    return cachedGitStatus;
  }

  // Check if we're in a git repo
  const isGit = execNoThrow('git rev-parse --is-inside-work-tree 2>/dev/null');
  if (!isGit) {
    cachedGitStatus = null;
    gitStatusCacheTime = now;
    return null;
  }

  try {
    const branch = execNoThrow('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no branch)"');
    const mainBranch = execNoThrow('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@.*/@@" || echo "main"');
    const status = execNoThrow('git status --short 2>/dev/null || true');
    const log = execNoThrow('git log --oneline -n 5 2>/dev/null || true');
    const userName = execNoThrow('git config user.name 2>/dev/null || true') || null;

    cachedGitStatus = { status, branch, mainBranch, log, userName };
    gitStatusCacheTime = now;
    return cachedGitStatus;
  } catch {
    cachedGitStatus = null;
    gitStatusCacheTime = now;
    return null;
  }
}

export function invalidateGitCache(): void {
  cachedGitStatus = null;
  gitStatusCacheTime = 0;
}

// ---- CLAUDE.md loading ----

interface ClaudeMdResult {
  content: string;
  path: string;
}

function findClaudeMdFiles(): ClaudeMdResult[] {
  const results: ClaudeMdResult[] = [];
  const projectRoot = getProjectRoot();

  // Always check project root
  const rootPath = resolve(projectRoot, 'CLAUDE.md');
  if (existsSync(rootPath)) {
    try {
      const content = readFileSync(rootPath, 'utf-8');
      results.push({ content, path: rootPath });
    } catch { /* ignore */ }
  }

  // Also check for .claude/CLAUDE.md
  const claudeDirPath = resolve(projectRoot, '.claude', 'CLAUDE.md');
  if (existsSync(claudeDirPath)) {
    try {
      const content = readFileSync(claudeDirPath, 'utf-8');
      results.push({ content, path: claudeDirPath });
    } catch { /* ignore */ }
  }

  return results;
}

// ---- Project context ----

interface ProjectInfo {
  root: string;
  name: string;
  language?: string;
  packageManager?: string;
}

function detectProjectInfo(): ProjectInfo | null {
  const root = getProjectRoot();
  const name = basename(root);

  try {
    if (existsSync(resolve(root, 'package.json'))) {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
      const pm = existsSync(resolve(root, 'bun.lockb')) || existsSync(resolve(root, 'bun.lock')) ? 'bun'
        : existsSync(resolve(root, 'pnpm-lock.yaml')) ? 'pnpm'
        : existsSync(resolve(root, 'yarn.lock')) ? 'yarn'
        : 'npm';
      return { root, name, language: 'JavaScript/TypeScript', packageManager: pm };
    }
    if (existsSync(resolve(root, 'Cargo.toml'))) {
      return { root, name, language: 'Rust', packageManager: 'cargo' };
    }
    if (existsSync(resolve(root, 'go.mod'))) {
      return { root, name, language: 'Go', packageManager: 'go' };
    }
    if (existsSync(resolve(root, 'pyproject.toml')) || existsSync(resolve(root, 'requirements.txt'))) {
      return { root, name, language: 'Python', packageManager: 'pip' };
    }

    return { root, name };
  } catch {
    return { root, name };
  }
}

// ---- Cached contexts ----

let cachedSystemContext: SystemContext | null = null;
let cachedUserContext: UserContext | null = null;
let cachedProjectInfo: ProjectInfo | null = null;

// ---- Public types ----

export interface SystemContext {
  gitStatus: string | null;
  currentBranch: string | null;
  mainBranch: string | null;
  recentCommits: string | null;
  gitUser: string | null;
}

export interface UserContext {
  claudeMd?: string;
  claudeMdFiles: ClaudeMdResult[];
  currentDate: string;
  projectInfo: ProjectInfo | null;
}

// ---- Public API ----

export async function getSystemContext(): Promise<SystemContext> {
  if (cachedSystemContext) return cachedSystemContext;

  const git = getGitStatus();
  const ctx: SystemContext = {
    gitStatus: git?.status ?? null,
    currentBranch: git?.branch ?? null,
    mainBranch: git?.mainBranch ?? null,
    recentCommits: git?.log ?? null,
    gitUser: git?.userName ?? null,
  };
  cachedSystemContext = ctx;
  return ctx;
}

export async function getUserContext(): Promise<UserContext> {
  if (cachedUserContext) return cachedUserContext;

  const ctx: UserContext = {
    currentDate: new Date().toISOString().split('T')[0],
    claudeMdFiles: findClaudeMdFiles(),
    projectInfo: cachedProjectInfo ??= detectProjectInfo(),
  };

  // Set the first CLAUDE.md as primary
  if (ctx.claudeMdFiles.length > 0) {
    ctx.claudeMd = ctx.claudeMdFiles[0].content;
  }
  cachedUserContext = ctx;
  return ctx;
}

export function invalidateContextCaches(): void {
  cachedSystemContext = null;
  cachedUserContext = null;
  cachedProjectInfo = null;
}

// ---- System prompt builder ----

export function buildSystemPrompt(context: SystemContext, userContext: UserContext): string {
  const parts: string[] = [];

  // Date
  parts.push(`Today's date is ${userContext.currentDate}.`);

  // Identity
  const projectName = userContext.projectInfo?.name ?? 'unknown';
  parts.push(`You are YourCA (Your Coding Assistant), an AI programming assistant running in the terminal.
You are helping the user with their project "${projectName}".

## Core capabilities
- Read, write, and edit files in the project directory
- Execute shell commands via the Bash tool
- Search files with Glob (pattern matching) and Grep (content search)
- Search the web with WebSearch and WebFetch
- Use the Agent tool to spawn sub-agents for complex or multi-step tasks
  - Choose agent type: general-purpose (全能), explore (只读调研), verify (对抗验证)
  - Spawn in background with run_in_background=true
- Use /memory to search past conversations and decisions
- Use /role to switch context wing
- Use /goal to set and track session goals

## Guidelines
- Write clean, correct, idiomatic code
- Use the Bash tool to install dependencies, run tests, and explore the project
- Always read a file before editing it
- Prefer the dedicated file/search tools over shell commands when one fits
- Keep responses concise and actionable
- Reference code with file_path:line_number format
- You are powered by DeepSeek, not Claude. Do not claim to be Claude.`);

  // Project info
  const pi = userContext.projectInfo;
  if (pi) {
    const infoParts: string[] = [`Project: ${pi.name}`];
    if (pi.language) infoParts.push(`Language: ${pi.language}`);
    if (pi.packageManager) infoParts.push(`Package manager: ${pi.packageManager}`);
    if (pi.root) infoParts.push(`Root: ${pi.root}`);
    parts.push('', '## Project info', infoParts.join('\n'));
  }

  // CLAUDE.md
  if (userContext.claudeMd) {
    parts.push('', '## Project instructions (CLAUDE.md)', userContext.claudeMd);
  }

  // Git state
  if (context.currentBranch) {
    parts.push('', '## Git state');
    parts.push(`Current branch: ${context.currentBranch}`);
    if (context.mainBranch) parts.push(`Main branch: ${context.mainBranch}`);
    if (context.gitUser) parts.push(`Git user: ${context.gitUser}`);
  }
  if (context.gitStatus) {
    parts.push('Working tree:\n' + context.gitStatus);
  }
  if (context.recentCommits) {
    parts.push('Recent commits:', context.recentCommits);
  }

  return parts.join('\n');
}
