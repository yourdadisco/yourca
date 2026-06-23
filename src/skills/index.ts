/**
 * Skills system — ported from Claude Code's skills system.
 * Provides:
 * - Skill command creation with frontmatter parsing
 * - Bundled skill registration
 * - File-based skill discovery from directories
 * - Argument substitution
 */

import type { ToolUseContext, Message } from '../tool/Tool.js';
import { getProjectRoot } from '../state/bootstrap.js';

// ─── Types ───

export type SkillSource = 'bundled' | 'skills' | 'commands_DEPRECATED' | 'plugin' | 'mcp';

export interface SkillCommand {
  type: 'prompt';
  name: string;
  aliases?: string[];
  description: string;
  whenToUse?: string;
  source: SkillSource;
  loadedFrom?: string;
  filePath?: string;
  hasUserSpecifiedDescription?: boolean;
  allowedTools?: string[];
  model?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  argumentHint?: string;
  argumentNames?: string[];
  getPromptForCommand(args: string, context: SkillContext): Promise<string | undefined>;
  getPromptForModel?(args: string, context: SkillContext): Promise<string | undefined>;
}

export interface SkillContext {
  cwd: string;
  sessionId: string;
}

export interface BundledSkillDefinition {
  name: string;
  description: string;
  aliases?: string[];
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  model?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  isEnabled?: () => boolean;
  getPromptForCommand: (args: string) => string | Promise<string>;
}

export interface SkillFile {
  name: string;
  description: string;
  content: string;
  source: SkillSource;
  filePath?: string;
}

// ─── Skill Registry ───

const bundledSkills: Map<string, SkillCommand> = new Map();
const fileSkills: Map<string, SkillCommand> = new Map();
const dynamicSkills: Map<string, SkillCommand> = new Map();

// ─── Bundled Skill Registration ───

export function registerBundledSkill(def: BundledSkillDefinition): void {
  const cmd: SkillCommand = {
    type: 'prompt',
    name: def.name,
    aliases: def.aliases,
    description: def.description,
    whenToUse: def.whenToUse,
    argumentHint: def.argumentHint,
    allowedTools: def.allowedTools,
    model: def.model,
    disableModelInvocation: def.disableModelInvocation,
    userInvocable: def.userInvocable ?? true,
    source: 'bundled',
    loadedFrom: 'bundled',
    hasUserSpecifiedDescription: true,
    getPromptForCommand: async (args: string) => {
      let prompt = await Promise.resolve(def.getPromptForCommand(args));
      // Substitute $CLAUDE_SKILL_DIR
      prompt = prompt.replace(/\$CLAUDE_SKILL_DIR/g, getProjectRoot());
      return prompt;
    },
  };

  bundledSkills.set(def.name, cmd);
}

export function getBundledSkills(): SkillCommand[] {
  return Array.from(bundledSkills.values());
}

export function clearBundledSkills(): void {
  bundledSkills.clear();
}

// ─── File Skills ───

export function registerFileSkill(skill: SkillFile): void {
  const cmd: SkillCommand = {
    type: 'prompt',
    name: skill.name,
    description: skill.description,
    source: skill.source,
    loadedFrom: skill.source,
    filePath: skill.filePath,
    hasUserSpecifiedDescription: true,
    getPromptForCommand: async (args: string) => {
      let prompt = skill.content;
      // Substitute $CLAUDE_SKILL_DIR
      if (skill.filePath) {
        prompt = prompt.replace(/\$CLAUDE_SKILL_DIR/g, path.dirname(skill.filePath));
      }
      return prompt;
    },
  };

  fileSkills.set(skill.name, cmd);
}

export function getFileSkills(): SkillCommand[] {
  return Array.from(fileSkills.values());
}

// ─── All Skills ───

export function getAllSkills(): SkillCommand[] {
  return [...getBundledSkills(), ...getFileSkills(), ...Array.from(dynamicSkills.values())];
}

export function findSkill(name: string): SkillCommand | undefined {
  // Check bundled first
  const bundled = bundledSkills.get(name);
  if (bundled) return bundled;

  // Check file skills
  const file = fileSkills.get(name);
  if (file) return file;

  // Check dynamic
  const dyn = dynamicSkills.get(name);
  if (dyn) return dyn;

  // Search by alias
  for (const skill of getAllSkills()) {
    if (skill.aliases?.includes(name)) return skill;
  }

  return undefined;
}

export function getSkillCount(): number {
  return getAllSkills().length;
}

// ─── Skill Directory Loading ───

import * as fs from 'fs';
import * as path from 'path';

export function loadSkillsFromDir(dir: string, source: SkillSource = 'skills'): SkillFile[] {
  const results: SkillFile[] = [];

  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(dir, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillFile)) continue;

      try {
        const content = fs.readFileSync(skillFile, 'utf-8');
        const frontmatter = parseFrontmatter(content);
        const name = frontmatter.name || entry.name;
        const description = frontmatter.description || `${name} skill`;

        results.push({
          name,
          description,
          content: frontmatter.body || content,
          source,
          filePath: skillFile,
        });
      } catch { /* skip unreadable skills */ }
    }
  } catch { /* ignore directory read errors */ }

  return results;
}

function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const result: { name?: string; description?: string; body: string } = { body: content };

  // Check for YAML frontmatter between --- markers
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return result;

  const frontmatter = match[1];
  result.body = match[2];

  // Parse simple key: value pairs
  for (const line of frontmatter.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      const val = kv[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'name') result.name = val;
      else if (key === 'description') result.description = val;
    }
  }

  return result;
}

// ─── Dynamic Skills ───

export function addDynamicSkill(skill: SkillCommand): void {
  dynamicSkills.set(skill.name, skill);
}

export function getDynamicSkills(): SkillCommand[] {
  return Array.from(dynamicSkills.values());
}

export function clearDynamicSkills(): void {
  dynamicSkills.clear();
}

// ─── Init Bundled Skills ───

export function initBundledSkills(): void {
  // Register built-in bundled skills
  registerBundledSkill({
    name: 'debug',
    description: 'Debug an issue by analyzing error messages and suggesting fixes',
    whenToUse: 'When the user encounters an error or bug and needs help debugging',
    userInvocable: true,
    getPromptForCommand: (args) => `I need help debugging this issue:

${args || 'Please analyze the current error or problem and help me find a solution.'}

Please:
1. Understand the error message and context
2. Find the root cause of the problem
3. Suggest concrete fixes
4. Help verify the fix works`,
  });

  registerBundledSkill({
    name: 'simplify',
    description: 'Simplify and refactor code for better readability and maintainability',
    whenToUse: 'When code is complex, hard to read, or needs refactoring',
    userInvocable: true,
    getPromptForCommand: (args) => `Please help me simplify this code:

${args || 'Review the current code and suggest simplifications.'}

Focus on:
1. Reducing complexity and nesting
2. Improving readability
3. Removing duplication
4. Following best practices
5. Maintaining the same behavior`,
  });

  registerBundledSkill({
    name: 'verify',
    description: 'Verify that a code change works correctly by running tests and checking behavior',
    whenToUse: 'After making changes, to verify they work correctly',
    userInvocable: true,
    getPromptForCommand: (args) => `Please verify that this change works correctly:

${args || 'Verify the recent changes are working properly.'}

Check:
1. The code compiles without errors
2. Tests pass
3. The behavior is correct
4. No regressions introduced`,
  });

  registerBundledSkill({
    name: 'remember',
    description: 'Save an important piece of information to the project memory',
    whenToUse: 'When the user says something important to remember for future sessions',
    userInvocable: true,
    getPromptForCommand: (args) => `Please help me remember this information for future sessions:

${args || 'Save the following information to project memory.'}

Please save this as a memory with:
- A clear, descriptive name
- The full information to remember
- Why it matters`,
  });

  registerBundledSkill({
    name: 'stuck',
    description: 'Get unstuck by analyzing the problem from a different angle',
    whenToUse: 'When you are stuck on a problem and need a fresh perspective',
    userInvocable: true,
    getPromptForCommand: (args) => `I'm stuck on this problem and need help:

${args || 'Please help me get unstuck.'}

Please:
1. Summarize what I'm trying to do
2. Identify what's blocking me
3. Suggest alternative approaches
4. Recommend the simplest next step`,
  });
}
