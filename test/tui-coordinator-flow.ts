/**
 * TUI test: verify coordinator spawns workers → gets results → verifies
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-coordinator-flow.log');
let pass = 0, fail = 0;

function log(s: string) { fs.appendFileSync(LOG, s + '\n', 'utf-8'); process.stdout.write(s + '\n'); }
function ok(n: string, c: boolean) { log(`  ${c ? '✅' : '❌'} ${n}`); if (c) pass++; else fail++; }

function spawnCLI() {
  let output = '';
  const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env } });
  proc.stdout.on('data', (d: Buffer) => { output += d.toString('utf-8'); });
  return {
    proc, output: () => output,
    send: (s: string) => proc.stdin.write(s + '\n'),
    waitFor: async (marker: string, timeout = 120000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (output.includes(marker)) return true;
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    },
    kill: () => proc.kill(9),
  };
}

async function main() {
  log('=== Coordinator Flow TUI Test ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  const cli = spawnCLI();
  await cli.waitFor('> ', 10000);
  log('✅ TUI ready\n');

  // Step 1: Ask a task that benefits from multi-agent
  // "Find and analyze" is the type of task where a coordinator would
  // naturally spawn an explore agent to research, then report.
  log('--- Step 1: Sending multi-step task ---');
  cli.send('请调研这个项目，找出所有使用到的第三方库和框架，列出它们的用途。直接用工具调査，不要 spawn agent');
  // Note: "不要 spawn agent" tells the model to do it directly without Agent tool
  // This tests the NORMAL (non-agent) path first

  const toolsFound = await cli.waitFor('Grep', 180000)
    || await cli.waitFor('Bash', 180000)
    || await cli.waitFor('Glob', 180000)
    || await cli.waitFor('Read', 180000);
  ok('Model uses direct tools for simple task', toolsFound);

  // Wait for completion
  await cli.waitFor('> ', 300000);
  const afterTask1 = cli.output();
  log(`  (${afterTask1.length} chars of output)`);

  // Step 2: Ask a complex task where Agent tool makes sense
  // Clear the conversation and start fresh
  log('\n--- Step 2: Complex multi-file task ---');
  log('Sending: "请分析 src/services/ 目录下的所有文件，列出每个文件导出的函数和它们的用途。"\n');

  const queryStart = Date.now();
  cli.send('请分析 src/services/ 目录下的所有文件，列出每个文件导出的函数和用途');

  // Wait for output to stabilize
  const outputStartLen = cli.output().length;
  await new Promise(r => setTimeout(r, 120000));
  const afterTask2 = cli.output();

  const usedAgent = afterTask2.includes('Agent(') || afterTask2.includes('subagent') || afterTask2.includes('Agent(');
  const usedTools = afterTask2.includes('Read') || afterTask2.includes('Glob') || afterTask2.includes('Bash');
  const hasResults = afterTask2.includes('.ts') || afterTask2.includes('src/');

  ok('Model used Agent tool for complex task', usedAgent);
  ok('Model used tools (Read/Bash/Glob)', usedTools);
  ok('Model produced results (file paths)', hasResults);

  log(`  Duration: ${((Date.now() - queryStart) / 1000).toFixed(0)}s`);

  cli.kill();
  log(`\n=== ${pass}/${pass+fail} passed ===`);
  fs.writeFileSync(LOG + '.raw.txt', cli.output(), 'utf-8');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
