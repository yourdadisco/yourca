/**
 * REPL integration test — verifies the Ink-based REPL starts and renders correctly.
 * Runs in a real terminal context using Node.js child_process with piped stdio.
 *
 * Usage: npx tsx test/repl-test.ts
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
function ok(m: string) { pass++; console.log(chalk.green('  ✓ ' + m)); }
function no(m: string, e?: any) { fail++; console.log(chalk.red('  ✗ ' + m + (e ? ': ' + e.message : ''))); }

async function test(name: string, fn: () => Promise<void>) {
  console.log(chalk.bold('\n' + name));
  try { await fn(); } catch (e: any) { no(name, e); }
}

// ─── Test: REPL starts and renders the welcome screen ───

async function testREPLRenders() {
  const entryPoint = resolve(__dirname, '..', 'dist', 'index.js');

  // Start REPL in a subprocess with piped stdin
  const proc = spawn(process.execPath, [entryPoint], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEEPSEEK_API_KEY: 'sk-test-key', NODE_ENV: 'test', YOURCA_DISABLE_AUTO_MEMORY: '1' },
    timeout: 5000,
  });

  // Collect stdout for a moment
  const chunks: Buffer[] = [];
  let errorOutput = '';

  proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
  proc.stderr?.on('data', (d: Buffer) => { errorOutput += d.toString(); });

  // Wait for the REPL to render
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      resolve();
    }, 3000);

    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('exit', () => { clearTimeout(timer); resolve(); });
  });

  const output = Buffer.concat(chunks).toString('utf-8');
  const combined = output + errorOutput;

  // Check that the Ink REPL rendered its UI elements
  if (combined.includes('YourCA')) ok('REPL: shows brand name');
  else no('REPL: missing "YourCA"', new Error('Output: ' + combined.slice(0, 200)));

  if (combined.includes('/help')) ok('REPL: shows help hint');
  else no('REPL: missing help hint');

  // The mock stdin allows Ink to render without crashing
  if (!combined.includes('Raw mode is not supported')) ok('REPL: no raw mode error');
  else no('REPL: raw mode error still present');
}

// ─── Test: --version and --help work ───

async function testCLI() {
  const entryPoint = resolve(__dirname, '..', 'dist', 'index.js');

  // Test --version
  const verProc = spawn('node', [entryPoint, '--version'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const verOut = await new Promise<string>(resolve => {
    let d = '';
    verProc.stdout?.on('data', (c: Buffer) => d += c.toString());
    verProc.on('exit', () => resolve(d));
  });
  if (verOut.includes('0.1.0')) ok('CLI: --version works');
  else no('CLI: --version', new Error(verOut));

  // Test --help
  const helpProc = spawn('node', [entryPoint, '--help'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const helpOut = await new Promise<string>(resolve => {
    let d = '';
    helpProc.stdout?.on('data', (c: Buffer) => d += c.toString());
    helpProc.on('exit', () => resolve(d));
  });
  if (helpOut.includes('Usage')) ok('CLI: --help works');
  else no('CLI: --help', new Error(helpOut));
}

// ─── Main ───

async function main() {
  console.log(chalk.bold.cyan('╔══════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   YourCA REPL Integration Test  ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════╝'));

  await test('1. REPL Renders UI', testREPLRenders);
  await test('2. CLI Entry Points', testCLI);

  const total = pass + fail;
  console.log(chalk.bold('\n' + '─'.repeat(40)));
  console.log(chalk.bold('Results: ' + pass + '/' + total + ' passed'));
  if (fail > 0) { console.log(chalk.red(fail + ' failed')); process.exit(1); }
  else console.log(chalk.green('\nAll REPL integration tests passed! ✓'));
}

main();
