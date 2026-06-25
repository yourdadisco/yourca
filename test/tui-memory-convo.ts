/**
 * TUI Conversation Test — waits for prompt (> ), not fixed sleep.
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-memory-convo.log');

function log(msg: string) {
  fs.appendFileSync(LOG, msg + '\n', 'utf-8');
  process.stdout.write(msg + '\n');
}

function write(msg: string) {
  fs.appendFileSync(LOG, msg, 'utf-8');
  process.stdout.write(msg);
}

/** Wait until stdout has `> ` (the REPL prompt), or timeout. Returns captured output. */
function waitForPrompt(proc: any, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve) => {
    let buf = '';
    const timer = setTimeout(() => {
      proc.stdout.removeListener('data', onData);
      resolve(buf);
    }, timeoutMs);
    const onData = (data: Buffer) => {
      buf += data.toString('utf-8');
      // REPL prints `> ` as prompt — that's our signal
      if (buf.includes('> \n') || buf.endsWith('> ')) {
        clearTimeout(timer);
        proc.stdout.removeListener('data', onData);
        resolve(buf);
      }
    };
    proc.stdout.on('data', onData);
  });
}

async function sendAndWait(proc: any, line: string, label: string): Promise<string> {
  write(`\n--- ${label} ---\n`);
  proc.stdin.write(line + '\n');
  const output = await waitForPrompt(proc);
  log(`  Input:  ${line}`);
  // Extract the last meaningful response (between last two prompts)
  const lines = output.split('\n').filter(l => l.trim() && l !== '> ' && !l.startsWith('> '));
  const response = lines.slice(-5).join('\n  ');
  if (response) log(`  Output: ${response}`);
  return output;
}

async function main() {
  log('=== TUI Memory Conversation Test (Prompt-Based) ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  const proc = spawn('node', [YOURCA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // Wait for first prompt
  log('Waiting for TUI startup...');
  await waitForPrompt(proc, 10000);
  log('✅ TUI ready\n');

  // 1. /memory
  await sendAndWait(proc, '/memory', '/memory (stats)');

  // 2. /role
  await sendAndWait(proc, '/role', '/role');

  // 3. /goal test
  await sendAndWait(proc, '/goal test-memory', '/goal');

  // 4. Store a preference
  log('\n--- /memory_store (storing preference) ---');
  proc.stdin.write('记住：用户偏好Vitest测试框架，喜欢TypeScript\n');
  log('  Input: 记住...');
  const storeOutput = await waitForPrompt(proc, 120000);
  log('  AI replied (waiting for prompt ⏎)');
  // Extract AI's response text between the prompt markers
  const storeLines = storeOutput.split('\n').filter(l => l.trim() && l !== '> ');
  const aiResponse = storeLines.filter(l => !l.includes('YourCA v') && !l.includes('Type /help')).slice(-3).join('│');
  log(`  AI: ${aiResponse}`);

  // 5. Ask if AI remembers
  const recallOutput = await sendAndWait(proc, '我之前告诉过你我喜欢什么测试框架？', 'Asking AI to recall');
  const recallLines = recallOutput.split('\n').filter(l => l.trim() && l !== '> ');
  const aiRecall = recallLines.filter(l => !l.includes('YourCA v') && !l.includes('Type /help')).slice(-3).join('│');
  log(`  AI: ${aiRecall}`);

  // 6. /memory search
  await sendAndWait(proc, '/memory Vitest', '/memory Vitest');

  // Done
  proc.kill(9);

  // Summary
  log('\n=== SUMMARY ===');
  log(`  ${storeOutput.length > 0 ? '✅' : '❌'} AI acknowledged storage`);
  log(`  ${recallOutput.includes('Vitest') || recallOutput.includes('vitest') ? '✅' : '❌'} AI recalled memory`);
  log(`  ${storeOutput.includes('Drawers') ? '✅' : '❌'} /memory works`);
  log('\nFull log: ' + LOG);
}

main().catch(err => { log(`\nFATAL: ${err.message}`); process.exit(1); });
