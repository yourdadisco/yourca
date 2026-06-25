#!/usr/bin/env node
/**
 * YourCA — CLI AI programming assistant (Powered by DeepSeek)
 * Ink-based terminal UI (same tech stack as Claude Code)
 *
 * Usage:
 *   yourca                        Start interactive REPL
 *   yourca --setup                First-time setup (save API key)
 *   yourca --api-key sk-...       Run with specific API key
 *   yourca "prompt"               Single query
 *   echo "prompt" | yourca -      Stdin mode
 *   yourca --version              Show version
 *   yourca --help                 Show help
 */

import chalk from 'chalk';
import * as readline from 'readline/promises';
import { stdin as stdinIn, stdout as stdoutOut } from 'process';
import { startREPLFromEntry } from './repl/REPL.js';
import { runSingleQuery } from './repl/singleQuery.js';
import { saveConfig, loadConfig } from './utils/config.js';
import { initMempalace, detectProjectWing, setCurrentWing } from './services/vectorMemory/index.js';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  // Initialize MemPalace
  try {
    const wing = detectProjectWing();
    setCurrentWing(wing);
    await initMempalace({
      l0Identity: `You are YourCA, a general-purpose AI assistant.\nCurrent wing: ${wing}\nDetermine your role from the project context.`,
      wing,
    });
  } catch (e) { console.error('Warning: MemPalace init failed, memory disabled:', (e as Error).message); }

  const args = process.argv.slice(2);

  // Parse --api-key flag (can appear anywhere)
  let apiKeyArg: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && i + 1 < args.length) {
      apiKeyArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--api-key=')) {
      apiKeyArg = args[i].split('=')[1];
    } else {
      filteredArgs.push(args[i]);
    }
  }

  if (apiKeyArg) saveConfig({ api_key: apiKeyArg });
  const mainArgs = filteredArgs;

  if (mainArgs.length === 1 && mainArgs[0] === '--setup') { await runSetup(); return; }
  if (mainArgs.length === 1 && (mainArgs[0] === '--version' || mainArgs[0] === '-v')) {
    console.log(`${VERSION} (YourCA)`); return;
  }
  if (mainArgs.length === 1 && (mainArgs[0] === '--help' || mainArgs[0] === '-h')) { printHelp(); return; }
  if (mainArgs.length >= 1 && mainArgs[0] !== '-') { await runSingleQuery(mainArgs.join(' ')); return; }
  if (mainArgs.length === 1 && mainArgs[0] === '-') {
    const stdin = await readStdin();
    if (stdin) { await runSingleQuery(stdin); return; }
  }

  await startREPLFromEntry();
}

async function runSetup(): Promise<void> {
  console.log(chalk.bold.cyan('\n  YourCA Setup'));
  const rl = readline.createInterface({ input: stdinIn, output: stdoutOut });
  const key = await rl.question(chalk.white('Enter your DeepSeek API key: '));
  if (!key.trim()) { console.log(chalk.red('No key entered.')); rl.close(); return; }
  saveConfig({ api_key: key.trim() });
  console.log(chalk.green('\nAPI key saved to ~/.yourca/config.json'));
  rl.close();
}

function printHelp(): void {
  console.log(chalk.bold('YourCA — Coding Assistant (DeepSeek)'));
  console.log('');
  console.log('Usage:');
  console.log('  yourca                        Start interactive REPL');
  console.log('  yourca --setup                First-time setup');
  console.log('  yourca --api-key sk-...       Save API key');
  console.log('  yourca "prompt"               Single query');
  console.log('  echo "prompt" | yourca -      Stdin mode');
  console.log('  yourca --version              Show version');
  console.log('  yourca --help                 Show help');
  console.log('');
  console.log('Config: ~/.yourca/config.json');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8').trim();
}

main().catch((err) => {
  if (err.message?.includes('readline') || err.message?.includes('closed')) process.exit(0);
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
