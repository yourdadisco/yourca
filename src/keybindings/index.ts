/**
 * Keybindings system — ported from Claude Code's keybindings system.
 * Provides:
 * - Keybinding parsing and matching
 * - Default keybindings
 * - User keybinding customization
 * - Chord key support
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ───

export interface ParsedKeystroke {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface Keybinding {
  chord: ParsedKeystroke[];
  action: string;
  context?: string;
}

export type KeybindingContext =
  | 'global' | 'chat' | 'completion' | 'history' | 'tasks'
  | 'help' | 'selection' | 'vim_insert' | 'vim_normal';

// ─── Parsing ───

const KEY_ALIASES: Record<string, string> = {
  'control': 'ctrl',
  'option': 'alt',
  'command': 'meta',
  'cmd': 'meta',
  'super': 'meta',
  'win': 'meta',
  'escape': 'esc',
  'return': 'enter',
  'space': ' ',
};

export function parseKeystroke(s: string): ParsedKeystroke | null {
  const parts = s.toLowerCase().split('+').map(p => p.trim());
  const stroke: ParsedKeystroke = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const aliased = KEY_ALIASES[part] ?? part;

    if (aliased === 'ctrl') stroke.ctrl = true;
    else if (aliased === 'alt') stroke.alt = true;
    else if (aliased === 'shift') stroke.shift = true;
    else if (aliased === 'meta') stroke.meta = true;
    else stroke.key = aliased;
  }

  if (!stroke.key) return null;
  return stroke;
}

export function parseChord(s: string): ParsedKeystroke[] {
  return s.split(' ').map(part => parseKeystroke(part)).filter((k): k is ParsedKeystroke => k !== null);
}

export function keystrokeToString(k: ParsedKeystroke): string {
  const parts: string[] = [];
  if (k.ctrl) parts.push('Ctrl');
  if (k.alt) parts.push('Alt');
  if (k.shift) parts.push('Shift');
  if (k.meta) parts.push('Meta');
  parts.push(k.key.toUpperCase());
  return parts.join('+');
}

// ─── Matching ───

export function matchesKeystroke(input: ParsedKeystroke, target: ParsedKeystroke): boolean {
  return input.key === target.key
    && input.ctrl === target.ctrl
    && input.alt === target.alt
    && input.shift === target.shift
    && input.meta === target.meta;
}

export function matchesBinding(chord: ParsedKeystroke[], binding: Keybinding): boolean {
  if (chord.length !== binding.chord.length) return false;
  for (let i = 0; i < chord.length; i++) {
    if (!matchesKeystroke(chord[i], binding.chord[i])) return false;
  }
  return true;
}

// ─── Default Bindings ───

const DEFAULT_BINDINGS: Keybinding[] = [
  { chord: parseChord('ctrl+c'), action: 'interrupt', context: 'global' },
  { chord: parseChord('ctrl+d'), action: 'exit', context: 'global' },
  { chord: parseChord('ctrl+l'), action: 'clear', context: 'global' },
  { chord: parseChord('ctrl+n'), action: 'next_history', context: 'chat' },
  { chord: parseChord('ctrl+p'), action: 'prev_history', context: 'chat' },
  { chord: parseChord('ctrl+r'), action: 'search_history', context: 'chat' },
  { chord: parseChord('ctrl+a'), action: 'line_start', context: 'chat' },
  { chord: parseChord('ctrl+e'), action: 'line_end', context: 'chat' },
  { chord: parseChord('ctrl+u'), action: 'clear_line', context: 'chat' },
  { chord: parseChord('ctrl+k'), action: 'kill_line', context: 'chat' },
  { chord: parseChord('ctrl+w'), action: 'kill_word', context: 'chat' },
  { chord: parseChord('tab'), action: 'complete', context: 'chat' },
  { chord: parseChord('escape'), action: 'cancel', context: 'global' },
  { chord: parseChord('escape v'), action: 'vim_mode', context: 'global' },
  { chord: parseChord('up'), action: 'prev_history', context: 'chat' },
  { chord: parseChord('down'), action: 'next_history', context: 'chat' },
  { chord: parseChord('pageup'), action: 'scroll_up', context: 'chat' },
  { chord: parseChord('pagedown'), action: 'scroll_down', context: 'chat' },
];

// ─── Keybinding Store ───

const userBindingsPath = path.join(os.homedir(), '.yourca', 'keybindings.json');
let bindings: Keybinding[] = [...DEFAULT_BINDINGS];

export function getDefaultBindings(): Keybinding[] {
  return [...DEFAULT_BINDINGS];
}

export function loadUserBindings(): Keybinding[] {
  try {
    if (fs.existsSync(userBindingsPath)) {
      const content = fs.readFileSync(userBindingsPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.bindings)) {
        for (const b of parsed.bindings) {
          if (b.chord && b.action) {
            bindings.push({
              chord: parseChord(b.chord),
              action: b.action,
              context: b.context,
            });
          }
        }
      }
    }
  } catch { /* ignore */ }
  return [...bindings];
}

export function getAllBindings(): Keybinding[] {
  return [...bindings];
}

export function setBindings(newBindings: Keybinding[]): void {
  bindings = [...DEFAULT_BINDINGS, ...newBindings];
}

export function saveUserBindings(userBindings: { chord: string; action: string; context?: string }[]): void {
  try {
    const dir = path.dirname(userBindingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(userBindingsPath, JSON.stringify({ bindings: userBindings }, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

// ─── Resolution ───

export function resolveBinding(chord: ParsedKeystroke[], context?: KeybindingContext): string | null {
  // Context-specific first, then global
  if (context) {
    for (const b of bindings) {
      if (b.context === context && matchesBinding(chord, b)) {
        return b.action;
      }
    }
  }

  // Fallback to global
  for (const b of bindings) {
    if ((!b.context || b.context === 'global') && matchesBinding(chord, b)) {
      return b.action;
    }
  }

  return null;
}

export function getBindingDisplay(action: string): string {
  for (const b of bindings) {
    if (b.action === action && b.chord.length === 1) {
      return keystrokeToString(b.chord[0]);
    }
  }
  return '';
}
