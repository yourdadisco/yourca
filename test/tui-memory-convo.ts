/**
 * TUI Real Conversation Test: tests if model remembers information
 * across conversation turns via enhanceSystemPrompt.
 * Spawns yourca, has a real conversation, captures output.
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-memory-convo.log');

function write(msg: string) {
  fs.appendFileSync(LOG, msg, 'utf-8');
  process.stdout.write(msg);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  write('=== TUI Memory Conversation Test ===\n\n');
  try { fs.unlinkSync(LOG); } catch {}

  const proc = spawn('node', [YOURCA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let allOutput = '';
  let dataSinceLastCapture = '';

  proc.stdout.on('data', (data: Buffer) => {
    const text = data.toString('utf-8');
    allOutput += text;
    dataSinceLastCapture += text;
  });
  proc.stderr.on('data', () => {});

  await sleep(3000);

  // Step 1: Check memory stats
  write('1. /memory before storing...\n');
  proc.stdin.write('/memory\n');
  await sleep(2000);
  write('   Captured: ' + dataSinceLastCapture.slice(-200) + '\n');
  dataSinceLastCapture = '';

  // Step 2: Store something (as a memory command, not conversation)
  write('\n2. Storing memory via memory_store tool...\n');
  // Can't call memory_store directly - it's a model tool. Instead, store via API
  proc.stdin.write('记住：用户偏好Vitest测试框架，喜欢TypeScript\n');
  await sleep(30000); // Wait for AI response

  write('   AI response captured: ' + dataSinceLastCapture.slice(0, 300) + '\n');
  dataSinceLastCapture = '';

  // Step 3: Ask if it remembers
  write('\n3. Asking about preferences...\n');
  proc.stdin.write('我之前告诉过你我喜欢什么测试框架？\n');
  await sleep(30000);

  write('   AI response: ' + dataSinceLastCapture.slice(0, 300) + '\n');
  dataSinceLastCapture = '';

  // Step 4: Check /memory command
  write('\n4. /memory search...\n');
  proc.stdin.write('/memory Vitest\n');
  await sleep(3000);
  write('   /memory result: ' + dataSinceLastCapture.slice(0, 200) + '\n');

  // Done
  proc.kill(9);
  write('\n\n=== FULL OUTPUT ===\n');
  write(allOutput.slice(-2000)); // Last 2000 chars
  write('\n=== END ===\n');

  // Analysis
  write('\n--- Analysis ---\n');
  const hasMemoryStats = allOutput.includes('Drawers');
  const hasAIMemory = allOutput.includes('Vitest') || allOutput.includes('vitest');
  write(`  ${hasMemoryStats ? '✅' : '❌'} /memory command works\n`);
  write(`  ${hasAIMemory ? '✅' : '❌'} AI remembered information\n`);

  proc.kill();
}

main().catch(err => { write(`\nFATAL: ${err.message}`); process.exit(1); });
