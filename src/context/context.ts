/**
 * Context builder — provides system and user context for AI prompts.
 * Inspired by Claude Code's context.ts
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getProjectRoot } from '../state/bootstrap.js';

// Cache git status for the session
let cachedGitStatus: { status: string; branch: string; log: string } | null = null;

function getGitStatus(): { status: string; branch: string; log: string } {
  if (cachedGitStatus) return cachedGitStatus;

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no branch)"', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const status = execSync('git status --short 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const log = execSync('git log --oneline -n 5 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    cachedGitStatus = { status, branch, log };
  } catch {
    cachedGitStatus = { status: '', branch: 'unknown', log: '' };
  }

  return cachedGitStatus;
}

export function invalidateGitCache(): void {
  cachedGitStatus = null;
}

export interface SystemContext {
  gitStatus: string;
  currentBranch: string;
  recentCommits: string;
}

export interface UserContext {
  claudeMd?: string;
  currentDate: string;
}

export async function getSystemContext(): Promise<SystemContext> {
  const git = getGitStatus();
  return {
    gitStatus: git.status,
    currentBranch: git.branch,
    recentCommits: git.log,
  };
}

export async function getUserContext(): Promise<UserContext> {
  const ctx: UserContext = {
    currentDate: new Date().toISOString().split('T')[0],
  };

  // Load CLAUDE.md if it exists
  const projectRoot = getProjectRoot();
  const claudeMdPath = resolve(projectRoot, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      ctx.claudeMd = readFileSync(claudeMdPath, 'utf-8');
    } catch {
      // Ignore read errors
    }
  }

  return ctx;
}

export function buildSystemPrompt(context: SystemContext, userContext: UserContext): string {
  const date = userContext.currentDate;
  const parts: string[] = [
    `Today's date is ${date}.`,
    '',
    `You are YourCA (Your Coding Assistant), an AI programming assistant running in the terminal.
You help the user write, edit, and understand code in their project.

## Core capabilities
- Read, write, and edit files in the project
- Execute shell commands via the Bash tool
- Search files with Glob and Grep
- Search the web with WebSearch and WebFetch

## Guidelines
- Write clean, correct, idiomatic TypeScript/JavaScript code
- Use the Bash tool to install dependencies, run tests, and explore the project
- Always read a file before editing it
- Prefer the dedicated file/search tools over shell commands when one fits
- Keep responses concise and actionable
- When the user asks about the project structure, use Glob and Grep to explore
- Reference code with file_path:line_number format
- You are powered by DeepSeek, not Claude. Do not claim to be Claude.`,
  ];

  // Add CLAUDE.md context
  if (userContext.claudeMd) {
    parts.push(
      '',
      '## Project instructions (CLAUDE.md)',
      userContext.claudeMd,
    );
  }

  // Add git context
  if (context.currentBranch !== 'unknown') {
    parts.push(
      '',
      '## Git state',
      `Branch: ${context.currentBranch}`,
    );
  }
  if (context.gitStatus) {
    parts.push(
      'Working tree:',
      context.gitStatus,
    );
  }
  if (context.recentCommits) {
    parts.push(
      'Recent commits:',
      context.recentCommits,
    );
  }

  return parts.join('\n');
}
