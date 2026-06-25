import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-delm-real.log');
let pass = 0, fail = 0;

function log(s: string) { fs.appendFileSync(LOG, s + '\n', 'utf-8'); process.stdout.write(s + '\n'); }
function ok(n: string, c: boolean) { log(`  ${c ? '✅' : '❌'} ${n}`); if (c) pass++; else fail++; }

async function main() {
  log('=== DeLM Real TUI Test (100% TUI) ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, YOURCA_DELM_MODE: '1' } });
  let output = '';
  proc.stdout.on('data', (d: Buffer) => { output += d.toString('utf-8'); });

  const waitFor = async (markers: string[], timeout = 60000): Promise<boolean> => {
    const start = Date.now(); let lastLen = output.length;
    while (Date.now() - start < timeout) {
      for (const m of markers) { if (output.slice(lastLen).includes(m)) return true; }
      if (output.length > lastLen) lastLen = output.length;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  };

  await waitFor(['> '], 10000);
  log('TUI ready\n');

  // Test 1: Research task
  log('--- Test 1: Research task ---');
  const c1 = output.length;
  proc.stdin.write('调研这个项目用了哪些外部库\n');
  ok('AI uses tools (Glob/Bash/Grep)', await waitFor(['Glob', 'Bash', 'Grep'], 180000));
  await waitFor(['> '], 120000);
  ok('AI produces research results', output.slice(c1).includes('package.json') || output.slice(c1).includes('dependencies') || output.slice(c1).includes('node_modules') || output.slice(c1).includes('React'));

  // Test 2: Multi-task coordination
  log('\n--- Test 2: Multi-task coordination ---');
  const c2 = output.length;
  proc.stdin.write('你可以同时处理多个子任务吗？怎么协调？\n');
  ok('AI responds about coordination', await waitFor(['子任务', 'Agent', 'agent', '协调', '任务', '多个', '同时'], 120000));

  // Test 3: /goal set
  log('\n--- Test 3: /goal set ---');
  proc.stdin.write('/goal "列出src下的所有TypeScript文件"\n');
  ok('/goal set', await waitFor(['Goal set', 'goal'], 30000));
  await waitFor(['> '], 30000);

  // Test 4: Goal execution
  log('\n--- Test 4: Goal execution ---');
  const c4 = output.length;
  proc.stdin.write('列出src下的所有TypeScript文件\n');
  ok('AI works toward goal', await waitFor(['src/', '.ts', 'Glob'], 300000));
  await waitFor(['> '], 120000);
  ok('AI produces file list', output.slice(c4).includes('.ts'));

  // Test 5: Goal status
  log('\n--- Test 5: Goal status ---');
  const c5 = output.length;
  proc.stdin.write('/goal\n');
  await waitFor(['Goal', 'goal'], 30000);
  ok('/goal status works', output.slice(c5).includes('Goal') || output.slice(c5).includes('goal'));

  proc.kill(9);
  log(`\n${pass}/${pass+fail} passed\n`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
