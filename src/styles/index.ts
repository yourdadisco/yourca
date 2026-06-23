/**
 * Output styles system — ported from Claude Code's outputStyles.
 * Provides:
 * - Multiple output format styles
 * - Custom style loading from .claude/output-styles/
 * - Style selection and formatting
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ───

export interface OutputStyle {
  name: string;
  description: string;
  prompt: string;
  source: 'bundled' | 'file' | 'plugin';
  keepCodingInstructions?: boolean;
}

// ─── Style Registry ───

const styleRegistry: Map<string, OutputStyle> = new Map();

// ─── Bundled Styles ───

function registerBundledStyles(): void {
  registerStyle({
    name: 'default',
    description: 'Standard output with clear explanations and code formatting',
    prompt: 'Provide clear, well-structured responses with code blocks for any code.',
    source: 'bundled',
  });

  registerStyle({
    name: 'concise',
    description: 'Short, direct answers with minimal explanation',
    prompt: 'Be extremely concise. Provide only the essential information. Use short sentences. No fluff. Prefer code over explanations.',
    source: 'bundled',
  });

  registerStyle({
    name: 'detailed',
    description: 'Thorough explanations with educational context',
    prompt: 'Provide thorough, detailed explanations. Include educational context, trade-offs, and alternatives. Explain your reasoning step by step.',
    source: 'bundled',
  });

  registerStyle({
    name: 'code-only',
    description: 'Return only code without explanatory text',
    prompt: 'Return only code blocks. No explanations, no commentary. Just the code.',
    source: 'bundled',
    keepCodingInstructions: true,
  });
}

// ─── API ───

export function registerStyle(style: OutputStyle): void {
  styleRegistry.set(style.name, style);
}

export function getStyle(name: string): OutputStyle | undefined {
  return styleRegistry.get(name);
}

export function getAllStyles(): OutputStyle[] {
  return Array.from(styleRegistry.values());
}

export function getActiveStyle(): OutputStyle {
  const activeName = getActiveStyleName();
  return styleRegistry.get(activeName) ?? styleRegistry.get('default')!;
}

let activeStyleName: string = 'default';

export function setActiveStyle(name: string): boolean {
  if (styleRegistry.has(name)) {
    activeStyleName = name;
    return true;
  }
  return false;
}

export function getActiveStyleName(): string {
  return activeStyleName;
}

// ─── File-based styles ───

export function loadStylesFromDir(dir: string): OutputStyle[] {
  const styles: OutputStyle[] = [];
  if (!fs.existsSync(dir)) return styles;

  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const name = file.replace(/\.md$/, '');
        const firstLine = content.split('\n')[0];
        const description = firstLine.replace(/^#\s*/, '').trim() || `${name} style`;

        styles.push({
          name,
          description,
          prompt: content,
          source: 'file',
        });
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }

  return styles;
}

export function loadAllStyles(cwd: string): OutputStyle[] {
  const styles: OutputStyle[] = [];

  // Bundled
  registerBundledStyles();
  styles.push(...getAllStyles());

  // User styles
  const userStylesDir = path.join(os.homedir(), '.yourca', 'output-styles');
  styles.push(...loadStylesFromDir(userStylesDir));

  // Project styles
  const projectStylesDir = path.join(cwd, '.yourca', 'output-styles');
  styles.push(...loadStylesFromDir(projectStylesDir));

  return styles;
}

// ─── Formatting ───

export function applyStyleToPrompt(basePrompt: string, styleName?: string): string {
  const style = styleName ? getStyle(styleName) : getActiveStyle();
  if (!style) return basePrompt;

  const stylePrompt = style.prompt;
  if (!style.keepCodingInstructions) {
    return `${basePrompt}\n\n## Output Style\n${stylePrompt}`;
  }

  return `${stylePrompt}\n\n${basePrompt}`;
}

export function clearStyles(): void {
  styleRegistry.clear();
}
