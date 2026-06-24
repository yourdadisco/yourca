import * as fs from 'fs';
import * as path from 'path';
import { TASKS, type TestTask } from './tasks.js';
import { setArchitecture } from '../../src/coordinator/index.js';
import { initMempalace } from '../../src/services/vectorMemory/index.js';
import { initAPI } from '../../src/query/api.js';

interface RunResult {
  taskId: string;
  taskName: string;
  mode: 'normal' | 'coordinator' | 'delm';
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
  summary: string;
  error?: string;
  timestamp: string;
}

type AgentMode = 'normal' | 'coordinator' | 'delm';

interface ModeConfig { mode: AgentMode; envVar: string; envValue: string }

const MODES: ModeConfig[] = [
  { mode: 'normal', envVar: '', envValue: '' },
  { mode: 'coordinator', envVar: 'YOURCA_COORDINATOR_MODE', envValue: '1' },
  { mode: 'delm', envVar: 'YOURCA_DELM_MODE', envValue: '1' },
];

const RESULTS_DIR = path.join(import.meta.dirname, 'results');

function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function setMode(mc: ModeConfig): void {
  delete process.env.YOURCA_COORDINATOR_MODE;
  delete process.env.YOURCA_DELM_MODE;
  if (mc.envVar) process.env[mc.envVar] = mc.envValue;
  setArchitecture(mc.mode);
}

function fmtDur(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }
function fmtTok(t: number): string { return t.toLocaleString(); }

async function runTask(task: TestTask, mode: AgentMode): Promise<RunResult> {
  const { getTools } = await import('../../src/tool/tools.js');
  const { runSubagent } = await import('../../src/services/subagent.js');

  const permissionContext = { mode: 'default' as const, additionalWorkingDirectories: [] as string[] };
  const tools = getTools(permissionContext);
  const abortController = new AbortController();
  const toolUseContext = { abortController, getAppState: () => ({ tools }), setAppState: () => {}, messages: [] as any[], permissionContext, options: {} };
  const startTime = Date.now();

  try {
    const result = await runSubagent({ prompt: task.prompt, agentType: 'general-purpose', parentContext: toolUseContext as any, tools });
    return {
      taskId: task.id, taskName: task.name, mode,
      success: result.success,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      toolCalls: result.toolCallCount,
      durationMs: Date.now() - startTime,
      summary: result.text.slice(0, 200),
      error: result.error,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return { taskId: task.id, taskName: task.name, mode, success: false, inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: Date.now() - startTime, summary: '', error: err.message, timestamp: new Date().toISOString() };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeFilter = args.includes('--mode') ? args[args.indexOf('--mode') + 1] as AgentMode | undefined : undefined;
  const taskFilter = args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined;

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.YOURCA_API_KEY;
  if (!apiKey) { console.error('Error: DEEPSEEK_API_KEY not set'); process.exit(1); }
  initAPI({ apiKey });
  try { await initMempalace(); } catch {}
  ensureDir();

  const modes = modeFilter ? MODES.filter(m => m.mode === modeFilter) : MODES;
  const tasks = taskFilter ? TASKS.filter(t => t.id === taskFilter) : TASKS;

  console.log('\n=== Agent Architecture Benchmark ===\n');
  console.log(`Modes: ${modes.map(m => m.mode).join(', ')}`);
  console.log(`Tasks: ${tasks.length}\n`);

  const allResults: RunResult[] = [];

  for (const mc of modes) {
    console.log(`\n── Mode: ${mc.mode.toUpperCase()} ──\n`);
    for (const task of tasks) {
      process.stdout.write(`  Running "${task.name}"... `);
      setMode(mc);
      const r = await runTask(task, mc.mode);
      allResults.push(r);
      const t = r.inputTokens + r.outputTokens;
      console.log(`${r.success ? '✅' : '❌'} ${fmtTok(t)} tok, ${fmtDur(r.durationMs)}, ${r.toolCalls} tools`);
      if (!r.success) console.log(`    Error: ${r.error}`);
    }
  }

  const ts = new Date().toISOString().split('T')[0];
  // Merge with existing results from other modes
  let existing: any[] = [];
  const existingFile = path.join(RESULTS_DIR, `${ts}-all.json`);
  if (fs.existsSync(existingFile)) {
    try { existing = JSON.parse(fs.readFileSync(existingFile, 'utf-8')); } catch {}
  }
  // Replace same-mode results, keep others
  const merged = existing.filter((x: any) => !modes.some(m => m.mode === x.mode)).concat(allResults);
  fs.writeFileSync(existingFile, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\nResults saved to: ${existingFile}`);

  console.log('\n── Comparison ──\n');
  const h = `Task${' '.repeat(12)} | tok${' '.repeat(8)} | time${' '.repeat(7)} | tools`;
  console.log(h);
  console.log('-'.repeat(h.length));
  for (const task of tasks) {
    const tr = allResults.filter(r => r.taskId === task.id);
    for (const r of tr) {
      console.log(`  ${task.name.padEnd(14)} ${r.mode.padEnd(10)} ${fmtTok(r.inputTokens + r.outputTokens).padStart(8)} tok, ${fmtDur(r.durationMs).padStart(8)}, ${r.toolCalls} tools`);
    }
    console.log('');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
