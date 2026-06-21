#!/usr/bin/env node
/**
 * YourCA — Your Coding Assistant (Powered by DeepSeek)
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
import { startREPL } from './repl/REPL.js';
import { runSingleQuery } from './repl/singleQuery.js';
import { saveConfig, loadConfig } from './utils/config.js';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse --api-key flag (can appear anywhere)
  let apiKeyArg: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && i + 1 < args.length) {
      apiKeyArg = args[i + 1];
      i++; // skip next arg
    } else if (args[i].startsWith('--api-key=')) {
      apiKeyArg = args[i].split('=')[1];
    } else {
      filteredArgs.push(args[i]);
    }
  }

  // If --api-key provided, save it immediately
  if (apiKeyArg) {
    saveConfig({ api_key: apiKeyArg });
  }

  const mainArgs = filteredArgs;

  // --setup: interactive setup wizard
  if (mainArgs.length === 1 && mainArgs[0] === '--setup') {
    await runSetup();
    return;
  }

  // --version
  if (mainArgs.length === 1 && (mainArgs[0] === '--version' || mainArgs[0] === '-v')) {
    console.log(`${VERSION} (YourCA)`);
    return;
  }

  // --help
  if (mainArgs.length === 1 && (mainArgs[0] === '--help' || mainArgs[0] === '-h')) {
    printHelp();
    return;
  }

  // Single query
  if (mainArgs.length >= 1 && mainArgs[0] !== '-') {
    await runSingleQuery(mainArgs.join(' '));
    return;
  }

  // Stdin pipe
  if (mainArgs.length === 1 && mainArgs[0] === '-') {
    const stdin = await readStdin();
    if (stdin) {
      await runSingleQuery(stdin);
      return;
    }
  }

  // Default: interactive REPL
  await startREPL();
}

async function runSetup(): Promise<void> {
  console.log(chalk.bold.cyan('\n  ╔═══════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║   YourCA Setup Wizard    ║'));
  console.log(chalk.bold.cyan('  ╚═══════════════════════════╝'));
  console.log('');

  const rl = readline.createInterface({ input: stdinIn, output: stdoutOut });

  const key = await rl.question(chalk.white('Enter your DeepSeek API key: '));
  if (!key.trim()) {
    console.log(chalk.red('No key entered. Skipping setup.'));
    rl.close();
    return;
  }

  saveConfig({ api_key: key.trim() });
  console.log(chalk.green('\n✓ API key saved to ~/.yourca/config.json'));
  console.log(chalk.gray('You can now run: yourca'));
  rl.close();
}

function printHelp(): void {
  console.log(chalk.bold('YourCA — Your Coding Assistant (Powered by DeepSeek)'));
  console.log('');
  console.log('Usage:');
  console.log('  yourca                        Start interactive REPL');
  console.log('  yourca --setup                First-time setup wizard');
  console.log('  yourca --api-key sk-...       Save API key & start');
  console.log('  yourca "prompt"               Single query');
  console.log('  echo "prompt" | yourca -      Stdin mode');
  console.log('  yourca --version              Show version');
  console.log('  yourca --help                 Show this help');
  console.log('');
  console.log('Config file: ~/.yourca/config.json');
  console.log('  {"api_key": "sk-...", "model": "deepseek-chat"}');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

main().catch((err) => {
  if (err.message?.includes('readline') || err.message?.includes('closed')) {
    process.exit(0);
  }
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
