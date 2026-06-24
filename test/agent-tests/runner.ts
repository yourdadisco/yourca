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
  tokensUsed: { input: number; output: number };
  toolCalls: number;
  durationMs: number;
  summary: string;
  error?: string;
  timestamp: string;
}

type AgentMode = 'normal' | 'coordinator' | 'delm';

interface ModeConfig {
  mode: AgentMode;
  envVar: string;
  envValue: string;
}

const MODES: ModeConfig[] = [
  { mode: 'normal', envVar: '', envValue: '' },
  { mode: 'coordinator', envVar: 'YOURCA_COORDINATOR_MODE', envValue: '1' },
  { mode: 'delm', envVar: 'YOURCA_DELM_MODE', envValue: '1' },
];

const RESULTS_DIR = path.join(import.meta.dirname, 'results');

function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function setMode(modeConfig: ModeConfig): void {
  delete process.env.YOURCA_COORDINATOR_MODE;
  delete process.env.YOURCA_DELM_MODE;
  if (modeConfig.envVar) {
    process.env[modeConfig.envVar] = modeConfig.envValue;
  }
  setArchitecture(modeConfig.mode);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(t: number): string {
  return t.toLocaleString();
}

async function runTask(task: TestTask, mode: AgentMode): Promise<RunResult> {
  const { getTools } = await import('../../src/tool/tools.js');
  const { runSubagent } = await import('../../src/services/subagent.js');

  const permissionContext = {
    mode: 'default' as const,
    additionalWorkingDirectories: [] as string[],
  };

  const tools = getTools(permissionContext);
  const abortController = new AbortController();

  const toolUseContext = {
    abortController,
    getAppState: () => ({ tools }),
    setAppState: () => {},
    messages: [] as any[],
    permissionContext,
  };

  const startTime = Date.now();

  try {
    const result = await runSubagent({
      prompt: task.prompt,
      agentType: 'general-purpose',
      parentContext: toolUseContext as any,
      tools,
    });

    const durationMs = Date.now() - startTime;

    return {
      taskId: task.id,
      taskName: task.name,
      mode,
      success: result.success,
      tokensUsed: result.usage,
      toolCalls: result.toolCallCount,
      durationMs,
      summary: result.text.slice(0, 200),
      error: result.error,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      taskId: task.id,
      taskName: task.name,
      mode,
      success: false,
      tokensUsed: { input: 0, output: 0 },
      toolCalls: 0,
      durationMs: Date.now() - startTime,
      summary: '',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeFilter = args.includes('--mode') ? args[args.indexOf('--mode') + 1] as AgentMode | undefined : undefined;
  const taskFilter = args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined;

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.YOURCA_API_KEY;
  if (!apiKey) {
    console.error('Error: DEEPSEEK_API_KEY not set');
    process.exit(1);
  }
  initAPI({ apiKey });

  try { await initMempalace(); } catch {}

  ensureDir();

  const modes = modeFilter ? MODES.filter(m => m.mode === modeFilter) : MODES;
  const tasks = taskFilter ? TASKS.filter(t => t.id === taskFilter) : TASKS;

  console.log('\n=== Agent Architecture Benchmark ===\n');
  console.log(`Modes: ${modes.map(m => m.mode).join(', ')}`);
  console.log(`Tasks: ${tasks.length}\n`);

  const allResults: RunResult[] = [];

  for (const modeConfig of modes) {
    console.log(`\n── Mode: ${modeConfig.mode.toUpperCase()} ──\n`);

    for (const task of tasks) {
      process.stdout.write(`  Running "${task.name}"... `);

      setMode(modeConfig);

      const result = await runTask(task, modeConfig.mode);
      allResults.push(result);

      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${formatTokens(result.tokensUsed.input + result.tokensUsed.output)} tok, ${formatDuration(result.durationMs)}, ${result.toolCalls} tools`);
      if (!result.success) {
        console.log(`    Error: ${result.error}`);
      }
    }
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const resultFile = path.join(RESULTS_DIR, `${timestamp}-all.json`);
  fs.writeFileSync(resultFile, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\nResults saved to: ${resultFile}`);

  console.log('\n── Comparison ──\n');
  const header = `Task${' '.repeat(12)} | normal tok${' '.repeat(6)} | coord tok${' '.repeat(6)} | delm tok${' '.repeat(6)} | normal time | coord time | delm time`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const task of tasks) {
    const tResults = allResults.filter(r => r.taskId === task.id);
    const getVal = (mode: string, field: string): string => {
      const r = tResults.find(r => r.mode === mode);
      if (!r) return '─'.repeat(8);
      if (field === 'durationMs') return formatDuration(r.durationMs).padStart(8);
      if (field === 'tokens') return formatTokens(r.tokensUsed.input + r.tokensUsed.output).padStart(10);
      return '─'.repeat(8);
    };

    console.log(
      `${task.name.padEnd(16)} | ${getVal('normal', 'tokens')} | ${getVal('coordinator', 'tokens')} | ${getVal('delm', 'tokens')} | ${getVal('normal', 'durationMs')} | ${getVal('coordinator', 'durationMs')} | ${getVal('delm', 'durationMs')}`
    );
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
