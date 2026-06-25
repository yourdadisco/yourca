/**
 * Spawns yourca as a child process, sends lines with timing,
 * captures all output to test memory commands in real TUI.
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-spawn-test.log');

function write(msg: string) {
  fs.appendFileSync(LOG, msg, 'utf-8');
  process.stdout.write(msg);
}

async function waitForOutput(proc: any, marker: string, timeoutMs = 30000): Promise<string> {
  const start = Date.now();
  let output = '';
  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      output += data.toString('utf-8');
      if (output.includes(marker) || Date.now() - start > timeoutMs) {
        proc.stdout.removeListener('data', onData);
        resolve(output);
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => {
      proc.stdout.removeListener('data', onData);
      resolve(output);
    }, timeoutMs);
  });
}

async function main() {
  write('=== TUI Spawn Test ===\n\n');
  try { fs.unlinkSync(LOG); } catch {}

  const proc = spawn('node', [YOURCA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY },
  });

  let allOutput = '';
  proc.stdout.on('data', (data: Buffer) => { allOutput += data.toString('utf-8'); });
  proc.stderr.on('data', () => {});

  // Wait for prompt
  await new Promise(r => setTimeout(r, 3000));
  write('1. Startup complete, sending /memory...\n');

  proc.stdin.write('/memory\n');
  await new Promise(r => setTimeout(r, 2000));

  proc.stdin.write('/role\n');
  await new Promise(r => setTimeout(r, 2000));

  proc.stdin.write('/goaltest\n');
  await new Promise(r => setTimeout(r, 2000));

  proc.stdin.write('/coordinator\n');
  await new Promise(r => setTimeout(r, 2000));

  // Kill
  proc.kill(9);
  await new Promise(r => setTimeout(r, 1000));

  write('\n=== FULL OUTPUT ===\n');
  write(allOutput);
  write('\n=== END ===\n');

  // Verify all commands appeared
  const checks = [
    ['/memory stats', allOutput.includes('MemPalace')],
    ['/role', allOutput.includes('wing')],
    ['/goal test', allOutput.includes('goal') || allOutput.includes('Goal')],
    ['/coordinator', allOutput.includes('coordinator') || allOutput.includes('Coordinator')],
  ];
  write('\n--- Results ---\n');
  for (const [name, ok] of checks) {
    write(`  ${ok ? '✅' : '❌'} ${name}\n`);
  }

  proc.kill();
}

main().catch(err => { console.error(err); process.exit(1); });
