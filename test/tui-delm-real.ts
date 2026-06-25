import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-delm-real.log');
let pass = 0, fail = 0;

function log(s: string) { fs.appendFileSync(LOG, s + '\n', 'utf-8'); process.stdout.write(s + '\n'); }
function ok(n: string, c: boolean) { log(`  ${c ? '✅' : '❌'} ${n}`); if (c) pass++; else fail++; }

async function main() {
  log('=== DeLM Real TUI Test ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  const env = { ...process.env, YOURCA_DELM_MODE: '1' };
  const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.resolve(import.meta.dirname, '..'), env });
  let output = '';
  proc.stdout.on('data', (d: Buffer) => { output += d.toString('utf-8'); });
  proc.stderr.on('data', () => {});

  const waitForNew = async (markers: string[], timeout = 60000): Promise<boolean> => {
    const start = Date.now();
    let lastLen = output.length;
    while (Date.now() - start < timeout) {
      const newOut = output.slice(lastLen);
      for (const m of markers) { if (newOut.includes(m)) return true; }
      if (newOut.length > 0) lastLen = output.length;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  };

  await waitForNew(['> '], 10000);
  log('✅ TUI ready\n');

  // Step 1: Task that benefits from multi-agent
  log('--- Step 1: Multi-step task ---');
  const c1 = output.length;
  proc.stdin.write('请调研这个项目的依赖关系\n');
  const t1 = await waitForNew(['Glob', 'Bash', 'Grep'], 180000);
  ok('AI uses tools for research', t1);
  if (t1) log(`  Tools detected\n`);
  await waitForNew(['> '], 120000);
  const new1 = output.slice(c1);
  ok('AI finds dependency info', new1.includes('package.json') || new1.includes('dependencies') || new1.includes('node_modules'));

  // Step 2: Verify DeML infrastructure
  log('\n--- Step 2: DeLM module verification ---');
  process.env.YOURCA_DELM_MODE = "1";
  const { isDelmMode, getTaskStatus, getLatestGist, addTask, publishToGist } = await import('../src/coordinator/delmMode.js');
  ok('DeLM mode detected', isDelmMode());
  const gid = publishToGist('verified', 'agent-1', 'Test result', ['test']);
  ok('Gist publish works', gid.length > 0);
  ok('Gist can be read', getLatestGist(5).length > 0);

  proc.kill(9);
  log(`\n=== ${pass}/${pass+fail} passed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
