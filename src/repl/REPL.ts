/**
 * YourCA REPL — polished readline-based TUI.
 * Reliable, beautiful, works in any terminal.
 */

import * as readline from 'readline';
import { stdin, stdout } from 'process';
import chalk from 'chalk';
import type { Tool, ToolPermissionContext } from '../tool/Tool.js';
import { createDefaultPermissionContext } from '../tool/permissions.js';
import { buildSystemPrompt, getSystemContext, getUserContext, invalidateContextCaches } from '../context/context.js';
import { runQuery, type QueryEvent } from '../query/QueryEngine.js';
import { createUserMessage } from '../query/messages.js';
import {
  getSessionId, getMainLoopModel, getTotalCostUSD,
  getTotalInputTokens, getTotalOutputTokens, getTurnCount, getTotalAPIDuration,
} from '../state/bootstrap.js';
import { parseSlashCommand, findCommand } from '../commands/index.js';
import { registerSignalHandlers, resetInterruptState } from '../services/signals.js';
import * as replState from './state.js';

const theme = {
  brand: chalk.hex('#d79650'),
  success: chalk.hex('#64c864'),
  error: chalk.hex('#dc5050'),
  warning: chalk.hex('#dcb43c'),
  info: chalk.hex('#64a0dc'),
  dim: chalk.hex('#9696a0'),
  text: chalk.hex('#dcdcdc'),
  subtle: chalk.hex('#787882'),
};

function header(): string {
  return '\n' +
    theme.brand('  ╭' + '─'.repeat(52) + '╮') + '\n' +
    theme.brand('  │  YourCA v0.1.0') + theme.dim(' — Coding Assistant') + theme.brand('                  │') + '\n' +
    theme.brand('  ╰' + '─'.repeat(52) + '╯') + '\n' +
    theme.dim('  Model: ' + getMainLoopModel() + '  │  ' + getSessionId().slice(0, 12) + '…') + '\n' +
    theme.dim('  /help  │  Esc to interrupt  │  Ctrl+D to exit') + '\n' +
    theme.dim('─'.repeat(56)) + '\n';
}

function footer(cost: string): string {
  return '\n' + theme.dim('─'.repeat(56)) + '\n' +
    theme.dim('  Cost: ' + cost + '  │  Tokens: ' +
      getTotalInputTokens().toLocaleString() + ' in / ' +
      getTotalOutputTokens().toLocaleString() + ' out') + '\n';
}

export async function startREPL(
  tools: readonly Tool[],
  systemPrompt: string,
  permissionContext: ToolPermissionContext = createDefaultPermissionContext(),
): Promise<void> {
  let sysCtx = await getSystemContext();
  let userCtx = await getUserContext();
  let sp = systemPrompt;

  // Detect light theme
  try {
    const { execSync } = await import('child_process');
    const r = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme',
      { encoding: 'utf-8', timeout: 2000 }
    );
    if (r.includes('0x1')) {
      // Switch to light theme colors
      Object.assign(theme, {
        text: chalk.hex('#282828'),
        dim: chalk.hex('#96969b'),
        subtle: chalk.hex('#787882'),
      });
    }
  } catch { /* use dark */ }

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: theme.brand('❯ '),
  });

  const cleanupSignals = registerSignalHandlers({
    onInterrupt: () => {
      if (replState.abortController.signal.aborted) process.exit(0);
      replState.abortController.abort();
      stdout.write(theme.warning('\n(Interrupting...)\n'));
      rl.prompt();
    },
    onShutdown: () => {},
  });

  console.log(header());
  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    const cost = '$' + getTotalCostUSD().toFixed(4);
    if (!trimmed) { rl.prompt(); return; }

    // Slash commands
    const parsed = parseSlashCommand(trimmed);
    if (parsed) {
      const cmd = findCommand(parsed.command);
      if (!cmd) {
        stdout.write(theme.warning('Unknown: /' + parsed.command + '. Type /help\n'));
        rl.prompt(); return;
      }
      if (cmd.name === 'exit' || cmd.name === 'quit') { rl.close(); return; }
      if (cmd.name === 'clear') {
        replState.resetMessages();
        replState.newAbortController();
        invalidateContextCaches();
        [sysCtx, userCtx] = await Promise.all([getSystemContext(), getUserContext()]);
        sp = buildSystemPrompt(sysCtx, userCtx);
        console.clear();
        console.log(header());
        rl.prompt(); return;
      }
      await cmd.action!(parsed.args, {
        tools, toolUseContext: {} as any,
        getMessages: () => replState.messages,
        setMessages: (msgs: any) => replState.setMessages(msgs),
        systemPrompt: sp, abortController: replState.abortController,
        requestUserInput: () => Promise.resolve(''),
      });
      rl.prompt(); return;
    }

    // Process query
    replState.addMessage(createUserMessage(trimmed));
    stdout.write('\n' + theme.success('❯ ') + theme.text(trimmed) + '\n');

    let textOutput = '';
    let compacted = false;

    try {
      await runQuery({
        messages: replState.messages,
        systemPrompt: sp,
        tools: tools as any,
        maxTurns: 25,
        abortController: replState.abortController,
        permissionContext,
        onEvent: (event: QueryEvent) => {
          switch (event.type) {
            case 'text':
              stdout.write(event.text);
              textOutput += event.text;
              break;
            case 'tool_start': {
              const preview = Object.values(event.input).find(v => typeof v === 'string')?.slice(0, 60) ?? '';
              stdout.write('\n  ' + theme.info('🔧 ' + event.name + '(' + preview + '…)') + '\n');
              break;
            }
            case 'tool_result_text': {
              const line1 = event.result?.split('\n')[0].slice(0, 60) || '';
              if (line1) stdout.write(theme.dim('  → ' + line1) + '\n');
              break;
            }
            case 'compact':
              if (!compacted) { compacted = true; stdout.write(theme.dim('  📦 Compacting context...\n')); }
              break;
            case 'error':
              stdout.write(theme.error('\n⚠ ' + event.message) + '\n');
              break;
          }
        },
      });
      replState.setMessages(replState.messages);
      stdout.write('\n');
    } catch (err: any) {
      if (err.name === 'AbortError') stdout.write(theme.warning('\nCancelled.\n'));
      else stdout.write(theme.error('\nError: ' + err.message) + '\n');
    } finally {
      replState.newAbortController();
      resetInterruptState();
    }

    rl.prompt();
  });

  rl.on('close', () => {
    const c = getTotalCostUSD();
    const inp = getTotalInputTokens().toLocaleString();
    const out = getTotalOutputTokens().toLocaleString();
    const dur = (getTotalAPIDuration() / 1000).toFixed(1);
    console.log(footer('$' + c.toFixed(4)));
    console.log(theme.dim('\nSession: $' + c.toFixed(4) + '  │  ' + inp + ' in / ' + out + ' out  │  ' + dur + 's\n'));
    cleanupSignals();
    process.exit(0);
  });

  rl.on('SIGINT', () => {
    if (replState.abortController.signal.aborted) rl.close();
    else {
      replState.abortController.abort();
      stdout.write(theme.warning('\n(Interrupting...)\n'));
      rl.prompt();
    }
  });
}

// ─── Entry point ───
import { getEnabledTools } from '../tool/tools.js';
import { initAPI } from '../query/api.js';
import { regenerateSessionId, setMainLoopModel } from '../state/bootstrap.js';
import { requireApiKey } from '../utils/config.js';

export async function startREPLFromEntry(): Promise<void> {
  const tools = getEnabledTools();
  regenerateSessionId();
  const apiKey = requireApiKey();
  initAPI({ apiKey });
  if (process.env.YOURCA_MODEL) setMainLoopModel(process.env.YOURCA_MODEL);
  const [sysCtx, userCtx] = await Promise.all([getSystemContext(), getUserContext()]);
  const systemPrompt = buildSystemPrompt(sysCtx, userCtx);
  await startREPL(tools, systemPrompt);
}
