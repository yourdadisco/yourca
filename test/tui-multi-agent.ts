/**
 * Multi-Agent TUI Test — tests ALL subsystems directly.
 * Commands: pipe-based. Tools: direct module calls.
 */
import { spawn } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-multi-agent.log');

let pass = 0, fail = 0;
function ok(n: string, c: boolean) { console.log(`  ${c ? '✅' : '❌'} ${n}`); fs.appendFileSync(LOG, `${c ? '✅' : '❌'} ${n}\n`, 'utf-8'); if (c) pass++; else fail++; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Multi-Agent TUI Test ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
  let stdout = '';
  proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
  await sleep(4000);

  async function cmd(line: string): Promise<string> {
    proc.stdin.write(line + '\n');
    await sleep(3000);
    return stdout;
  }

  // ── COMMANDS ──
  console.log('--- Commands ---');
  ok('/memory', (await cmd('/memory')).includes('Drawers'));
  ok('/role', (await cmd('/role')).includes('wing'));
  ok('/coordinator ON', (await cmd('/coordinator')).includes('ON'));
  ok('/coordinator OFF', (await cmd('/coordinator')).includes('OFF'));
  ok('/goal set', (await cmd('/goal test')).includes('Goal set'));
  ok('/goal status', (await cmd('/goal')).includes('Active'));
  ok('/goal clear', (await cmd('/goal clear')).includes('clear'));

  proc.kill(9);
  console.log(`\n=== Commands: ${pass}/${pass+fail} ===`);

  // ── DIRECT MODULE TESTS (no AI involved) ──
  console.log('\n--- Subsystems ---');
  const mPass = pass; const mFail = fail;

  // Memory system
  const { initMempalace, storeMemory, searchMemories, enhanceSystemPrompt, getWingStats } = await import('../src/services/vectorMemory/index.js');
  const { getBuiltInAgents, findAgent } = await import('../src/coordinator/agentRegistry.js');
  const { setGoalMode, isGoalModeActive, completeGoal, getGoalState } = await import('../src/services/goalEngine.js');
  const { setCoordinatorMode, isCoordinatorMode, getCoordinatorSystemPrompt } = await import('../src/coordinator/coordinatorMode.js');
  const { setDelmMode, isDelmMode, addTask, getTaskStatus, publishToGist } = await import('../src/coordinator/delmMode.js');
  const { runSubagent } = await import('../src/services/subagent.js');
  const { getEnabledTools } = await import('../src/tool/tools.js');

  await initMempalace({ l0Identity: 'test' });

  // Memory
  await storeMemory('test memory content for verification', { tags: ['test'] });
  const memResults = await searchMemories('test memory', 3);
  ok('Memory store + search', memResults.length > 0 && memResults.some(r => r.chunk.content.includes('test memory')));

  // enhanceSystemPrompt
  const enhanced = await enhanceSystemPrompt('Base.', 'test memory');
  ok('RAG context injection', enhanced !== 'Base.' && enhanced.includes('Relevant'));

  // Agent registry
  const agents = getBuiltInAgents();
  ok('Agent registry has 3 types', agents.length >= 3);
  ok('findAgent works', findAgent('general-purpose')?.agentType === 'general-purpose');
  ok('verify agent exists', findAgent('verify')?.agentType === 'verify');

  // Coordinator mode
  setCoordinatorMode(true);
  ok('Coordinator mode activation', isCoordinatorMode() === true);
  ok('Coordinator system prompt', getCoordinatorSystemPrompt().includes('coordinator'));
  setCoordinatorMode(false);
  ok('Coordinator mode deactivation', isCoordinatorMode() === false);

  // DeLM mode
  setDelmMode(true);
  ok('DeLM mode activation', isDelmMode() === true);
  const taskId = addTask('test task');
  ok('DeLM task queue', taskId.length > 0);
  ok('DeLM task status', getTaskStatus().total === 1);
  setDelmMode(false);

  // Goal engine
  setGoalMode('test goal');
  ok('Goal active', isGoalModeActive() === true);
  completeGoal();
  ok('Goal completed', getGoalState()?.status === 'completed');

  // Tool registration
  const tools = getEnabledTools();
  ok('Agent tool registered', tools.some(t => t.name === 'Agent'));
  ok('memory_store registered', tools.some(t => t.name === 'memory_store'));
  ok('SendMessage registered', tools.some(t => t.name === 'SendMessage'));
  ok('TaskStop registered', tools.some(t => t.name === 'TaskStop'));

  console.log(`\n=== Subsystems: ${pass - mPass}/${pass + fail - mPass - mFail} ===`);
  console.log(`\n=== TOTAL: ${pass}/${pass + fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
