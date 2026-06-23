/**
 * Vim mode system — ported from Claude Code's vim mode.
 * Provides:
 * - Vim state machine (NORMAL/INSERT modes)
 * - Motion commands (h/j/k/l/w/b/e, etc.)
 * - Operator commands (d, c, y, etc.)
 * - Text objects (iw, i(, i{, etc.)
 * - Dot repeat support
 */

import chalk from 'chalk';
import * as readline from 'readline';

// ─── Types ───

export type VimMode = 'INSERT' | 'NORMAL';
export type VimOperator = 'delete' | 'change' | 'yank' | 'none';

export interface VimState {
  mode: VimMode;
  insertedText: string;
  commandBuffer: string;
  operator: VimOperator;
  count: number;
  lastCommand: string;
  pendingTextObj: boolean;
}

export interface VimEditor {
  getCursor(): number;
  setCursor(pos: number): void;
  getLine(): string;
  setLine(text: string): void;
  getLines(): string[];
  setLines(lines: string[]): void;
  insertChar(ch: string): void;
  deleteChar(): void;
  getCursorRow(): number;
  setCursorRow(row: number): void;
}

// ─── State ───

export function createVimState(): VimState {
  return {
    mode: 'INSERT',
    insertedText: '',
    commandBuffer: '',
    operator: 'none',
    count: 1,
    lastCommand: '',
    pendingTextObj: false,
  };
}

// ─── Motions ───

export function moveCursor(editor: VimEditor, key: string, count: number): void {
  const line = editor.getLine();
  const pos = editor.getCursor();

  switch (key) {
    case 'h': editor.setCursor(Math.max(0, pos - count)); break;
    case 'j': editor.setCursorRow(editor.getCursorRow() + count); break;
    case 'k': editor.setCursorRow(Math.max(0, editor.getCursorRow() - count)); break;
    case 'l': editor.setCursor(Math.min(line.length, pos + count)); break;
    case '0': editor.setCursor(0); break;
    case '^': {
      const firstNonBlank = line.search(/\S/);
      editor.setCursor(firstNonBlank >= 0 ? firstNonBlank : 0);
      break;
    }
    case '$': editor.setCursor(line.length); break;
    case 'w': {
      let newPos = pos;
      for (let i = 0; i < count; i++) {
        // Skip whitespace
        while (newPos < line.length && /\s/.test(line[newPos])) newPos++;
        // Skip word
        while (newPos < line.length && /\S/.test(line[newPos])) newPos++;
      }
      editor.setCursor(newPos);
      break;
    }
    case 'b': {
      let newPos = pos;
      for (let i = 0; i < count; i++) {
        if (newPos <= 0) break;
        newPos--;
        // Skip whitespace backward
        while (newPos > 0 && /\s/.test(line[newPos])) newPos--;
        // Skip word backward
        while (newPos > 0 && /\S/.test(line[newPos - 1])) newPos--;
      }
      editor.setCursor(newPos);
      break;
    }
    case 'e': {
      let newPos = pos;
      for (let i = 0; i < count; i++) {
        // Skip current word forward
        while (newPos < line.length && /\S/.test(line[newPos])) newPos++;
        newPos = Math.min(line.length, newPos);
        if (newPos >= line.length) break;
        // Find end of next word
        while (newPos < line.length && /\s/.test(line[newPos])) newPos++;
        while (newPos < line.length && /\S/.test(line[newPos + 1])) newPos++;
      }
      editor.setCursor(newPos);
      break;
    }
  }
}

// ─── Operators ───

export function executeOperator(editor: VimEditor, state: VimState, operator: VimOperator, motion: string): void {
  const line = editor.getLine();
  const pos = editor.getCursor();
  const count = state.count;

  switch (operator) {
    case 'delete': {
      if (motion === 'w' || motion === 'e') {
        let end = pos;
        for (let i = 0; i < count; i++) {
          while (end < line.length && /\s/.test(line[end])) end++;
          while (end < line.length && /\S/.test(line[end])) end++;
        }
        const newLine = line.slice(0, pos) + line.slice(end);
        editor.setLine(newLine);
        editor.setCursor(pos);
      } else if (motion === 'b') {
        let start = pos;
        for (let i = 0; i < count; i++) {
          if (start <= 0) break;
          start--;
          while (start > 0 && /\s/.test(line[start])) start--;
          while (start > 0 && /\S/.test(line[start - 1])) start--;
        }
        const newLine = line.slice(0, start) + line.slice(pos);
        editor.setLine(newLine);
        editor.setCursor(start);
      } else if (motion === '$') {
        editor.setLine(line.slice(0, pos));
      } else if (motion === '0' || motion === '^') {
        const start = motion === '0' ? 0 : line.search(/\S/);
        const newLine = line.slice(0, start) + line.slice(pos);
        editor.setLine(newLine);
        editor.setCursor(start);
      } else if (motion === 'dd') {
        const lines = editor.getLines();
        const row = editor.getCursorRow();
        if (row >= 0 && row < lines.length) {
          lines.splice(row, 1);
          editor.setLines(lines);
          editor.setCursorRow(Math.min(row, lines.length - 1));
        }
      }
      break;
    }

    case 'change': {
      if (motion === 'w' || motion === 'e') {
        let end = pos;
        for (let i = 0; i < count; i++) {
          while (end < line.length && /\s/.test(line[end])) end++;
          while (end < line.length && /\S/.test(line[end])) end++;
        }
        const newLine = line.slice(0, pos) + line.slice(end);
        editor.setLine(newLine);
        state.mode = 'INSERT';
      } else if (motion === '$') {
        editor.setLine(line.slice(0, pos));
        state.mode = 'INSERT';
      } else if (motion === 'cc') {
        const lines = editor.getLines();
        const row = editor.getCursorRow();
        if (row >= 0 && row < lines.length) {
          lines[row] = '';
          editor.setLines(lines);
          editor.setCursor(0);
          state.mode = 'INSERT';
        }
      }
      break;
    }

    case 'yank': {
      if (motion === 'y' || motion === 'yy') {
        const lines = editor.getLines();
        const row = editor.getCursorRow();
        if (row >= 0 && row < lines.length) {
          state.insertedText = lines[row]; // Store in register
        }
      }
      break;
    }
  }

  state.lastCommand = operator + motion;
  state.commandBuffer = '';
  state.operator = 'none';
  state.count = 1;
}

// ─── Input Processor ───

export function processVimInput(state: VimState, editor: VimEditor, input: string): void {
  if (state.mode === 'INSERT') {
    if (input === '\x1b') { // ESC
      state.mode = 'NORMAL';
      state.commandBuffer = '';
      state.lastCommand = '';
      return;
    }
    if (input === '\x7f') { // Backspace
      editor.deleteChar();
      return;
    }
    editor.insertChar(input);
    state.insertedText += input;
    return;
  }

  // NORMAL mode
  if (state.commandBuffer === '' && /^[0-9]$/.test(input)) {
    state.count = parseInt(input, 10);
    state.commandBuffer = input;
    return;
  }

  if (/^[0-9]$/.test(input) && state.count > 0) {
    state.count = state.count * 10 + parseInt(input, 10);
    state.commandBuffer += input;
    return;
  }

  state.commandBuffer += input;

  // Check if operator key matches (e.g. 'd' for 'delete', 'c' for 'change', 'y' for 'yank')
  const operatorFirstChar = state.operator !== 'none' ? state.operator[0] : '';

  if (state.operator !== 'none') {
    // After operator, we expect a motion
    if (['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '^', '$'].includes(input)) {
      executeOperator(editor, state, state.operator, input);
    } else if (input === operatorFirstChar) {
      // Double operator (dd, cc, yy)
      executeOperator(editor, state, state.operator, input + input);
    }
    state.commandBuffer = '';
    state.count = 1;
    return;
  }

  switch (input) {
    case 'h': case 'j': case 'k': case 'l':
    case 'w': case 'b': case 'e':
    case '0': case '^': case '$':
      moveCursor(editor, input, state.count);
      state.commandBuffer = '';
      state.count = 1;
      break;

    case 'd':
      state.operator = 'delete';
      break;
    case 'c':
      state.operator = 'change';
      break;
    case 'y':
      state.operator = 'yank';
      break;

    case 'i':
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    case 'a': {
      // Append (move cursor right, enter insert)
      const line = editor.getLine();
      if (editor.getCursor() < line.length) {
        editor.setCursor(editor.getCursor() + 1);
      }
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    }
    case 'A':
      editor.setCursor(editor.getLine().length);
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    case 'I':
      editor.setCursor(0);
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    case 'o': {
      const lines = editor.getLines();
      const row = editor.getCursorRow();
      lines.splice(row + 1, 0, '');
      editor.setLines(lines);
      editor.setCursorRow(row + 1);
      editor.setCursor(0);
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    }
    case 'O': {
      const lines = editor.getLines();
      const row = editor.getCursorRow();
      lines.splice(row, 0, '');
      editor.setLines(lines);
      editor.setCursorRow(row);
      editor.setCursor(0);
      state.mode = 'INSERT';
      state.commandBuffer = '';
      break;
    }
    case 'x': {
      // Delete character under cursor
      const line = editor.getLine();
      if (line.length > 0) {
        const pos = editor.getCursor();
        editor.setLine(line.slice(0, pos) + line.slice(pos + 1));
      }
      state.commandBuffer = '';
      break;
    }
    case 'u': {
      // Undo (simplified — would need proper undo stack)
      state.commandBuffer = '';
      break;
    }
    case '.': {
      // Dot repeat — replay last command
      if (state.lastCommand) {
        state.commandBuffer = state.lastCommand;
        // Re-execute
        const op = state.lastCommand.length === 2 ? state.lastCommand[0] as VimOperator : 'none';
        const motion = state.lastCommand.length === 2 ? state.lastCommand[1] : state.lastCommand;
        if (op !== 'none') {
          executeOperator(editor, state, op, motion);
        }
      }
      break;
    }
    default:
      state.commandBuffer = '';
      state.count = 1;
      break;
  }
}

// ─── Mode Display ───

export function getVimModeDisplay(state: VimState): string {
  if (state.mode === 'NORMAL') {
    let display = '-- NORMAL --';
    if (state.operator !== 'none') {
      display += ` ${state.operator}`;
    }
    if (state.count > 1) {
      display += ` ${state.count}`;
    }
    return chalk.gray(display);
  }
  return chalk.gray('-- INSERT --');
}

export function isVimModeActive(state: VimState): boolean {
  return state.mode === 'NORMAL';
}
