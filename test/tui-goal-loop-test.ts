/**
 * TUI Goal Loop Test — verifies /goal mode spawns a verify agent
 * and iterates until completion.
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const YOURCA = path.join(PROJECT_ROOT, 'dist', 'index.js');
const LOG_PATH = path.join(PROJECT_ROOT, 'logs', 'tui-goal-loop.log');
const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function log(msg: string) { fs.appendFileSync(LOG_PATH, msg + '\n', 'utf-8'); process.stdout.write(msg); }
function result(name: string, pass: boolean, detail: string) { results.push({ name, pass, detail }); }

function spawnCLI() {
  let output = '';
  const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], cwd: PROJECT_ROOT, env: { ...process.env } });
  proc.stdout.on('data', (d: Buffer) => { output += d.toString('utf-8'); });
  proc.stderr.on('data', () => {});
  return { proc, output: () => output, send: (s: string) => proc.stdin.write(s + '\n'), kill: () => proc.kill(9) };
}

function makeOutputTracker(getOutput: () => string) {
  let cursor = 0;
  return {
    waitFor: async (markers: string[], timeoutMs: number): Promise<string> => {
      const startTime = Date.now();
      while (true) {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) throw new Error(`Timeout after ${timeoutMs}ms waiting for markers`);
        const newPart = getOutput().slice(cursor);
        for (const m of markers) {
          const idx = newPart.indexOf(m);
          if (idx !== -1) { cursor += idx + m.length; return getOutput(); }
        }
        await new Promise(r => setTimeout(r, 200));
      }
    },
  };
}

async function main() {
  try { fs.unlinkSync(LOG_PATH); } catch {}
  const cli = spawnCLI();
  const out = () => cli.output();
  const tracker = makeOutputTracker(out);

  await tracker.waitFor('> ', 20000);

  // Step 1: /goal set
  log('--- Step 1: Set /goal ---\n');
  cli.send('/goal "list all TypeScript files in src/"');
  await tracker.waitFor(['Goal set', 'goal'], 20000);
  const goalSetOk = out().includes('Goal set');
  result('/goal set', goalSetOk, goalSetOk ? 'Goal set OK' : 'Goal not found');

  // Step 2: Send task
  log('\n--- Step 2: Send task ---\n');
  const queryStart = Date.now();
  cli.send('list all TypeScript files in src/');

  // Step 3: Wait for verification markers OR idle timeout
  const AI_TIMEOUT = 360000; // 6 min
  const VERIFY_MARKERS = ["=== Goal", "🔍 Verifying", "✅ VERIFIED", "❌ NOT YET", "goal_completed];
  let verifyTriggered = false;
  try {
    await tracker.waitFor(VERIFY_MARKERS, AI_TIMEOUT);
    verifyTriggered = true;
  } catch {
    let lastLen = out().length;
    let idleStart = Date.now();
    while (Date.now() - queryStart < AI_TIMEOUT) {
      await new Promise(r => setTimeout(r, 2000));
      const curLen = out().length;
      if (curLen > lastLen) { lastLen = curLen; idleStart = Date.now(); }
      else if (Date.now() - idleStart > 30000) break;
    }
  }
  const duration = ((Date.now() - queryStart) / 1000).toFixed(1);
  log(`\n[OK] AI done after ${duration}s (verify triggered: ${verifyTriggered})\n`);

  const fullOut = out();

  // Step 4: Analysis
  const hasVerify = fullOut.includes('VERIFIED') || fullOut.includes('NOT YET') || fullOut.includes('Verifying');
  const hasGoalCompleted = fullOut.includes('goal_completed');
  const hasFileList = fullOut.includes('.ts');

  result('AI uses tools', fullOut.includes('Glob') || fullOut.includes('Bash'), 'Tools detected');
  result('AI lists files', hasFileList, 'File listing found');
  result('Verify agent fires', hasVerify || hasGoalCompleted, `Verify markers: ${hasVerify}, completed: ${hasGoalCompleted}`);

  // Step 5: Check goal status
  cli.send('/goal clear');

  log('\n--- RESULTS ---\n');
  let pass = 0, fail = 0;
  for (const r of results) {
    log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}: ${r.detail}\n`);
    if (r.pass) pass++; else fail++;
  }
  log(`\n${pass}/${pass + fail} passed\n`);
  cli.kill();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
