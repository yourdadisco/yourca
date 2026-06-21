/**
 * Readline-based REPL fallback (used when Ink TUI is unavailable).
 */
import chalk from 'chalk';
import * as readline from 'readline/promises';
import { stdin as processStdin, stdout as processStdout } from 'process';
import type { Tool } from '../tool/Tool.js';
import { buildSystemPrompt, getSystemContext, getUserContext } from '../context/context.js';
import { runQuery } from '../query/QueryEngine.js';
import { createUserMessage } from '../query/messages.js';
import {
  getSessionId, getMainLoopModel, getTotalCostUSD,
  getTotalInputTokens, getTotalOutputTokens, getTurnCount,
} from '../state/bootstrap.js';
import { parseSlashCommand, findCommand } from '../commands/index.js';
import * as replState from './state.js';

export async function startReadlineREPL(tools: readonly Tool[], systemPrompt: string): Promise<void> {
  let sysCtx = await getSystemContext();
  let userCtx = await getUserContext();
  let sp = systemPrompt;

  console.log(chalk.bold.cyan(`\n  YourCA v0.1.0 — ${chalk.gray('readline mode')}`));
  console.log(chalk.gray(`  Model: ${getMainLoopModel()} | Type /help\n`));

  const rl = readline.createInterface({ input: processStdin, output: processStdout, prompt: '' });

  const sigintHandler = () => {
    if (replState.abortController.signal.aborted) { process.exit(0); }
    replState.abortController.abort();
    process.stdout.write(chalk.yellow('\n(Interrupting...)\n'));
  };
  process.on('SIGINT', sigintHandler);

  while (true) {
    const line = await rl.question(chalk.cyan('> '));
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseSlashCommand(trimmed);
    if (parsed) {
      const cmd = findCommand(parsed.command);
      if (!cmd) { console.log(chalk.yellow(`Unknown: /${parsed.command}`)); continue; }

      if (cmd.name === 'clear') {
        replState.resetMessages();
        replState.newAbortController();
        const [n1, n2] = await Promise.all([getSystemContext(), getUserContext()]);
        sysCtx = n1; userCtx = n2;
        sp = buildSystemPrompt(sysCtx, userCtx);
        console.log(chalk.green('Cleared.'));
        continue;
      }
      if (cmd.name === 'exit') break;
      await cmd.action!(parsed.args, {
        tools, toolUseContext: {} as any,
        getMessages: () => replState.messages,
        setMessages: (msgs: any) => replState.setMessages(msgs),
        systemPrompt: sp, abortController: replState.abortController,
        requestUserInput: () => Promise.resolve(''),
      });
      continue;
    }

    try {
      replState.addMessage(createUserMessage(trimmed));
      let textOutput = '';
      let toolCount = 0;

      const result = await runQuery({
        messages: replState.messages, systemPrompt: sp, tools: tools as any,
        maxTurns: 25, abortController: replState.abortController,
        permissionContext: { mode: 'accept', additionalWorkingDirectories: [] },
        onEvent: (event: any) => {
          if (event.type === 'text') {
            process.stdout.write(event.text);
            textOutput += event.text;
          } else if (event.type === 'tool_start') {
            toolCount++;
            console.log(chalk.gray(`\n  🔧 ${event.name}(${JSON.stringify(event.input).slice(0, 100)}…)`));
          } else if (event.type === 'tool_result_text') {
            const preview = event.result?.split('\n')[0].slice(0, 80);
            if (preview) console.log(chalk.gray(`  ⬅️  ${preview}…`));
          } else if (event.type === 'error') {
            console.error(chalk.red(`\n⚠️ ${event.message}`));
          }
        },
      });
      replState.setMessages(result);
      console.log('');
    } catch (err: any) {
      if (err.name === 'AbortError') console.log(chalk.yellow('\nCancelled.'));
      else console.error(chalk.red(`\nError: ${err.message}`));
    } finally {
      replState.newAbortController();
    }
  }

  process.removeListener('SIGINT', sigintHandler);
  rl.close();
  const cost = getTotalCostUSD().toFixed(4);
  console.log(chalk.gray(`\nSession: $${cost} | ${getTotalInputTokens().toLocaleString()} in / ${getTotalOutputTokens().toLocaleString()} out`));
}

// Entry point
import { getEnabledTools } from '../tool/tools.js';
import { initAPI } from '../query/api.js';
import { regenerateSessionId, setMainLoopModel } from '../state/bootstrap.js';
import { requireApiKey } from '../utils/config.js';

export async function startREPL(): Promise<void> {
  const tools = getEnabledTools();
  regenerateSessionId();
  const apiKey = requireApiKey();
  initAPI({ apiKey });
  if (process.env.YOURCA_MODEL) setMainLoopModel(process.env.YOURCA_MODEL);
  const [sysCtx, userCtx] = await Promise.all([getSystemContext(), getUserContext()]);
  const systemPrompt = buildSystemPrompt(sysCtx, userCtx);
  await startReadlineREPL(tools, systemPrompt);
}
