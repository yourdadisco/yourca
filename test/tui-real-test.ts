/**
 * Real TUI test: spawns yourca and interacts through stdin/stdout.
 * Tests memory persistence across conversation turns.
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const LOG_FILE = path.join(import.meta.dirname, '..', 'logs', 'tui-real-test.log');
const YOURCA = path.join(import.meta.dirname, '..', 'dist', 'index.js');

function log(msg: string) {
  fs.appendFileSync(LOG_FILE, msg + '\n', 'utf-8');
  process.stdout.write(msg + '\n');
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendLine(proc: any, line: string): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    const onData = (data: string) => {
      const text = data.toString();
      output += text;
      // Keep collecting output until we see the prompt or newline
      if (text.includes('> ') || text.includes('\n')) {
        proc.stdout.removeListener('data', onData);
        resolve(output);
      }
    };
    proc.stdout.on('data', onData);
    proc.stdin.write(line + '\n');
  });
}

async function main() {
  log('=== Real TUI Memory Test ===\n');

  // Remove old log
  try { fs.unlinkSync(LOG_FILE); } catch {}

  log('Starting yourca TUI...');
  const proc = spawn('node', [YOURCA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY },
  });

  let startupOutput = '';
  proc.stdout.on('data', (data) => { startupOutput += data.toString(); });
  proc.stderr.on('data', (data) => { /* ignore stderr */ });

  // Wait for startup
  await sleep(5000);

  log('--- Test 1: /memory shows stats ---');
  proc.stdin.write('/memory\n');
  await sleep(2000);

  log('--- Test 2: /role shows wing ---');
  proc.stdin.write('/role\n');
  await sleep(2000);

  log('--- Test 3: /goal set and check ---');
  proc.stdin.write('/goal test-memory\n');
  await sleep(2000);
  proc.stdin.write('/goal\n');
  await sleep(2000);
  proc.stdin.write('/goal clear\n');
  await sleep(2000);

  log('--- Test 4: Memory conversation ---');
  // Tell the AI something to remember
  const msg1 = '记住，我喜欢用Vitest写测试，讨厌Jest';
  proc.stdin.write(msg1 + '\n');
  await sleep(15000); // Wait for AI to process

  log('--- Test 5: Ask about remembered info ---');
  const msg2 = '我之前说了我喜欢什么测试框架？';
  proc.stdin.write(msg2 + '\n');
  await sleep(15000); // Wait for AI response

  log('--- Test 6: /memory search ---');
  proc.stdin.write('/memory Vitest\n');
  await sleep(3000);

  // Kill
  proc.kill();

  log('\n=== Test Complete ===');
  log(`Full output saved to: ${LOG_FILE}`);
  log(startupOutput.slice(0, 2000)); // Show first 2K chars
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
