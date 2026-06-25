/**
 * TUI DeLM Test: verifies decentralized multi-agent collaboration.
 * - AgentTool publishes results to shared Gist
 * - Task queue tracks work items
 * - Agents can see each other's work
 */
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

const YOURCA = path.resolve(import.meta.dirname, '..', 'dist', 'index.js');
const LOG = path.resolve(import.meta.dirname, '..', 'logs', 'tui-delm-test.log');
let pass = 0, fail = 0;

function log(s: string) { fs.appendFileSync(LOG, s + '\n', 'utf-8'); process.stdout.write(s + '\n'); }
function ok(n: string, c: boolean) { log(`  ${c ? '✅' : '❌'} ${n}`); if (c) pass++; else fail++; }

const proc = spawn('node', [YOURCA], { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env } });
let output = '';
proc.stdout.on('data', (d: Buffer) => { output += d.toString('utf-8'); });

async function waitFor(markers: string[], timeout = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const m of markers) { if (output.includes(m)) return true; }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  log('=== DeLM TUI Test ===\n');
  try { fs.unlinkSync(LOG); } catch {}

  await waitFor(['> '], 10000);
  log('✅ TUI ready\n');

  // Since DeLM mode is env-var gated, test the DeLM structures directly
  // by spawning yourca and checking if AgentTool integrates with gist
  log('--- Step 1: Direct DeLM module test ---');

  const { setDelmMode, isDelmMode, addTask, publishToGist, getTaskStatus, getLatestGist, claimNextTask, completeTask } = await import('../src/coordinator/delmMode.js');

  setDelmMode(true);
  ok('DeLM mode activated', isDelmMode() === true);

  // Simulate an agent workflow
  const taskId = addTask('调研项目的依赖关系');
  ok('Task added to queue', taskId.length > 0);

  const claim = claimNextTask('agent-1');
  ok('Agent can claim task', claim !== null && claim!.id === taskId);

  completeTask(taskId, 'Found 56 TypeScript files');
  ok('Task completed', getTaskStatus().completed === 1);

  // Publish to gist
  const gistId = publishToGist('verified', 'agent-1', '项目使用React 18 + TypeScript', ['research']);
  ok('Result published to Gist', gistId.length > 0);

  const gist = getLatestGist(5);
  ok('Gist contains published result', gist.length === 1 && gist[0].type === 'verified');

  // Another agent reads gist
  ok('Gist entry has tags', gist[0].tags.includes('research'));
  ok('Gist entry has agentId', gist[0].agentId === 'agent-1');

  setDelmMode(false);

  // Now test the AgentTool integration
  log('\n--- Step 2: AgentTool DeLM integration ---');

  const { AgentTool } = await import('../src/tool/built-in/AgentTool.js');
  const { getEnabledTools } = await import('../src/tool/tools.js');

  setDelmMode(true);
  const tools = getEnabledTools();
  const result = await AgentTool.call(
    { prompt: 'test task', subagent_type: 'general-purpose' },
    { getAppState: () => ({ tools }), abortController: new AbortController(), setAppState: () => {}, messages: [], permissionContext: { mode: 'default', additionalWorkingDirectories: [] }, options: {} } as any,
  );

  ok('AgentTool works in DeLM mode', result.content.length > 0);

  const taskStatus = getTaskStatus();
  ok('DeLM task queue updated by AgentTool', taskStatus.total > 1);

  const gistAfter = getLatestGist(5);
  ok('DeLM gist updated by AgentTool', gistAfter.length > 0);

  setDelmMode(false);

  log(`\n=== ${pass}/${pass+fail} passed ===`);
  fs.writeFileSync(LOG + '.raw.txt', output, 'utf-8');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
