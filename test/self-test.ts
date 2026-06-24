/**
 * YourCA Self-Test Suite
 * Validates core components without requiring an API key.
 * Run: npx tsx test/self-test.ts
 */
import { createStore } from '../src/state/store.js';
import { createUserMessage, countTotalTokens } from '../src/query/messages.js';
import { getAllTools, getEnabledTools, toolToApiDefinition } from '../src/tool/tools.js';
import { findToolByName } from '../src/tool/Tool.js';
import { buildSystemPrompt } from '../src/context/context.js';
import { getAllCommands, findCommand, parseSlashCommand, isSlashCommand } from '../src/commands/index.js';
import { generateId } from '../src/state/bootstrap.js';

type TestStatus = 'passed' | 'failed';
const results: Array<{ name: string; status: TestStatus; detail?: string }> = [];
const TOTAL_TESTS = 16;
let completed = 0;

function printResult(name: string, status: TestStatus, detail?: string): void {
  const icon = status === 'passed' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(icon + ' ' + name + (detail ? ' \x1b[90m— ' + detail + '\x1b[0m' : ''));
  results.push({ name, status, detail });
  completed++;

  if (completed >= TOTAL_TESTS) {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log('\n  \x1b[1mResults: \x1b[32m' + passed + ' passed\x1b[0m, \x1b[31m' + failed + ' failed\x1b[0m\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => printResult(name, 'passed'))
        .catch((e: any) => printResult(name, 'failed', e.message));
    } else {
      printResult(name, 'passed');
    }
  } catch (e: any) {
    printResult(name, 'failed', e.message);
  }
}

// Run all tests immediately
(function runAll(): void {
  console.log('\x1b[1m\x1b[36m\n  YourCA Self-Test Suite\n\x1b[0m');

  // 1. State
  test('state: generateId format', () => {
    const id = generateId('t');
    if (!id.startsWith('t_')) throw new Error('should start with prefix');
    if (id.length <= 2) throw new Error('should have random suffix');
  });

  // 2. Store
  test('store: create, get, set, subscribe', () => {
    const store = createStore({ count: 0 });
    if (store.getState().count !== 0) throw new Error('initial state wrong');
    let notified = false;
    const unsub = store.subscribe(() => { notified = true; });
    store.setState((s) => ({ ...s, count: 1 }));
    if (store.getState().count !== 1) throw new Error('state not updated');
    if (!notified) throw new Error('listener not notified');
    unsub();
  });

  // 3. Messages
  test('messages: createUserMessage', () => {
    const msg = createUserMessage('hello');
    if (msg.role !== 'user') throw new Error('wrong role');
    if (msg.content[0].type !== 'text' || (msg.content[0] as any).text !== 'hello') throw new Error('wrong content');
  });

  test('messages: countTotalTokens', () => {
    const tokens = countTotalTokens('hello world');
    if (tokens <= 0) throw new Error('should be positive');
    if (tokens < 2 || tokens > 5) throw new Error('unexpected: ' + tokens);
  });

  // 4. Tools
  test('tools: getAllTools has all core tools', () => {
    const all = getAllTools();
    if (all.length < 6) throw new Error('need at least 6 tools');
    const names = all.map(t => t.name);
    ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'].forEach(n => {
      if (!names.includes(n)) throw new Error('missing ' + n);
    });
  });

  test('tools: getEnabledTools returns all', () => {
    if (getEnabledTools().length !== getAllTools().length) throw new Error('all should be enabled');
  });

  test('tools: toolToApiDefinition format', () => {
    const bash = getAllTools().find(t => t.name === 'Bash');
    if (!bash) throw new Error('Bash not found');
    const def = toolToApiDefinition(bash);
    if (def.name !== 'Bash' || !def.description || !def.input_schema?.properties?.command) throw new Error('bad format');
  });

  test('tools: findToolByName', () => {
    if (!findToolByName(getAllTools(), 'Bash')) throw new Error('should find Bash');
    if (!findToolByName(getAllTools(), 'Read')) throw new Error('should find Read');
    if (findToolByName(getAllTools(), 'FakeTool')) throw new Error('should not find fake');
  });

  test('tools: correct isReadOnly/isDestructive flags', () => {
    const all = getAllTools();
    const read = all.find(t => t.name === 'Read')!;
    const bash = all.find(t => t.name === 'Bash')!;
    const write = all.find(t => t.name === 'Write')!;
    if (!read.isReadOnly?.() || read.isDestructive?.()) throw new Error('Read flags wrong');
    if (bash.isReadOnly?.() || !bash.isDestructive?.()) throw new Error('Bash flags wrong');
    if (!write.isDestructive?.()) throw new Error('Write should be destructive');
  });

  test('tools: Edit tool schema validation', () => {
    const edit = getAllTools().find(t => t.name === 'Edit')!;
    const schema = edit.inputSchema as any;
    ['file_path', 'old_string', 'new_string'].forEach(f => {
      if (!(schema.required || []).includes(f)) throw new Error(f + ' not required');
      if (!schema.properties?.[f]) throw new Error('missing ' + f);
    });
  });

  // 5. Commands
  test('commands: getAllCommands', () => {
    if (getAllCommands().length < 6) throw new Error('need at least 6 commands');
  });

  test('commands: findCommand by name and alias', () => {
    if (!findCommand('help')) throw new Error('no help');
    if (!findCommand('clear')) throw new Error('no clear');
    if (!findCommand('exit')) throw new Error('no exit');
    if (!findCommand('quit')) throw new Error('no quit alias');
    if (!findCommand('?')) throw new Error('no ? alias');
    if (findCommand('fake')) throw new Error('should not find fake');
  });

  test('commands: slash detection and parsing', () => {
    if (!isSlashCommand('/help')) throw new Error('no detect /');
    if (isSlashCommand('help')) throw new Error('false positive');
    const p = parseSlashCommand('/model claude-3');
    if (!p || p.command !== 'model' || p.args !== 'claude-3') throw new Error('parse failed');
    if (parseSlashCommand('hello') !== null) throw new Error('should be null');
  });

  // 6. Context
  test('context: basic system prompt structure', () => {
    const p = buildSystemPrompt({ gitStatus: '', currentBranch: 'main', recentCommits: '' }, { currentDate: '2025-01-01' });
    if (!p.includes('YourCA')) throw new Error('no YourCA');
    if (!p.includes('2025-01-01')) throw new Error('no date');
    if (!p.includes('Bash') || !p.includes('Read')) throw new Error('missing tool refs');
  });

  test('context: includes CLAUDE.md content', () => {
    const p = buildSystemPrompt({ gitStatus: '', currentBranch: 'main', recentCommits: '' }, { currentDate: '2025-01-01', claudeMd: '# Custom\nAlways TS.' });
    if (!p.includes('Custom')) throw new Error('missing CLAUDE.md');
    if (!p.includes('Project instructions')) throw new Error('missing section header');
  });

  test('context: includes git branch and state', () => {
    const p = buildSystemPrompt({ gitStatus: 'M f.ts', currentBranch: 'feat-x', recentCommits: 'abc123 msg' }, { currentDate: '2025-01-01' });
    if (!p.includes('feat-x')) throw new Error('missing branch');
    if (!p.includes('Git state')) throw new Error('missing git section');
    if (!p.includes('M f.ts')) throw new Error('missing git status');
    if (!p.includes('abc123')) throw new Error('missing git log');
  });

  console.log('  (' + TOTAL_TESTS + ' tests registered)');
})();
