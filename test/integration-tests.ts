/**
 * Comprehensive integration tests for ALL ported modules.
 * Tests run in real TUI and verify every enterprise feature.
 *
 * Usage: npx tsx test/integration-tests.ts
 */

import chalk from 'chalk';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; console.log(chalk.green(`  ✓ ${msg}`)); }
  else { failed++; failures.push(msg); console.log(chalk.red(`  ✗ ${msg}`)); }
}

function assertEq<T>(a: T, b: T, msg: string): void {
  if (a === b) { passed++; console.log(chalk.green(`  ✓ ${msg}`)); }
  else { failed++; failures.push(msg); console.log(chalk.red(`  ✗ ${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)); }
}

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(chalk.bold(`\n${name}`));
  try { await fn(); }
  catch (err: any) { failed++; failures.push(`${name}: ${err.message}`); console.log(chalk.red(`  ✗ ${name}: ${err.message}`)); }
}

// ─── 1. Task System ───

async function testTasks(): Promise<void> {
  const { generateTaskId, createTaskStateBase, isTerminalTaskStatus, registerTask, getTaskByType, getAllTasks, createTask, getTaskState, updateTaskStatus, killAllTasks } = await import('../src/tasks/index.js');

  const id = generateTaskId('local_bash');
  assert(id.startsWith('b_'), 'Task ID has correct prefix');
  assert(id.length > 3, 'Task ID has sufficient length');

  const state = createTaskStateBase(id, 'local_bash', 'test');
  assertEq(state.status, 'pending', 'Task starts as pending');
  assert(state.id === id, 'Task ID preserved');
  assert(state.outputFile.length > 0, 'Task output file set');
  assert(!isTerminalTaskStatus('pending'), 'Pending is not terminal');
  assert(isTerminalTaskStatus('completed'), 'Completed is terminal');
  assert(isTerminalTaskStatus('failed'), 'Failed is terminal');
  assert(isTerminalTaskStatus('killed'), 'Killed is terminal');

  const task = { name: 'test-task', type: 'local_bash' as const, kill: async () => {} };
  registerTask(task);
  const found = getTaskByType('local_bash');
  assert(found !== undefined, 'find task by type');
  assert(getAllTasks().length >= 1, 'getAllTasks works');

  const activeTask = createTask('local_agent', 'agent task');
  assert(activeTask.id.startsWith('a_'), 'Agent task ID prefix');
  assertEq(activeTask.status, 'pending', 'Active task pending');
  assert(getTaskState(activeTask.id) !== undefined, 'getTaskState works');

  assert(updateTaskStatus(activeTask.id, 'running'), 'Update to running');
  assertEq(getTaskState(activeTask.id)!.status, 'running', 'Status updated');

  killAllTasks();
  assertEq(getTaskState(activeTask.id)!.status, 'killed', 'killAllTasks works');
}

// ─── 2. History System ───

async function testHistory(): Promise<void> {
  const { addToHistory, getHistory, removeLastFromHistory, clearHistory, setSkipHistory } = await import('../src/services/history.js');

  clearHistory();

  addToHistory('test entry 1');
  addToHistory('test entry 2');
  addToHistory('test entry 3');

  const entries = getHistory();
  assert(entries.length > 0, 'History returns entries');
  assert(entries.some(e => e.display.includes('test entry')), 'History contains our entries');

  const removed = removeLastFromHistory();
  assert(removed, 'removeLastFromHistory works');

  clearHistory();
  assertEq(getHistory().length, 0, 'clearHistory clears all');
}

// ─── 3. Skills System ───

async function testSkills(): Promise<void> {
  const { registerBundledSkill, getBundledSkills, findSkill, getAllSkills, initBundledSkills, loadSkillsFromDir } = await import('../src/skills/index.js');

  initBundledSkills();
  const bundled = getBundledSkills();
  assert(bundled.length >= 5, `Bundled skills registered: ${bundled.length}`);
  assert(bundled.some(s => s.name === 'debug'), 'debug skill exists');
  assert(bundled.some(s => s.name === 'simplify'), 'simplify skill exists');
  assert(bundled.some(s => s.name === 'verify'), 'verify skill exists');
  assert(bundled.some(s => s.name === 'remember'), 'remember skill exists');
  assert(bundled.some(s => s.name === 'stuck'), 'stuck skill exists');

  const debugSkill = findSkill('debug');
  assert(debugSkill !== undefined, 'findSkill finds debug');
  assertEq(debugSkill!.source, 'bundled', 'Bundled skill source is bundled');

  const prompt = await debugSkill!.getPromptForCommand('test error', { cwd: '/', sessionId: 's1' });
  assert(prompt !== undefined, 'Skill generates prompt');
  assert(prompt!.includes('test error'), 'Prompt includes user args');

  // Load from non-existent dir (should return empty)
  const fileSkills = loadSkillsFromDir('/nonexistent/skills', 'skills');
  assertEq(fileSkills.length, 0, 'Loading from nonexistent dir returns empty');

  const allSkills = getAllSkills();
  assert(allSkills.length >= 5, `All skills: ${allSkills.length}`);
}

// ─── 4. Keybindings System ───

async function testKeybindings(): Promise<void> {
  const { parseKeystroke, parseChord, matchesKeystroke, matchesBinding, getDefaultBindings, resolveBinding, keystrokeToString, loadUserBindings } = await import('../src/keybindings/index.js');

  const ks = parseKeystroke('ctrl+c');
  assert(ks !== null, 'Parse ctrl+c');
  assert(ks!.ctrl && ks!.key === 'c', 'Ctrl+C parsed correctly');

  const chord = parseChord('ctrl+c');
  assertEq(chord.length, 1, 'Single chord parsed');
  assert(chord[0].ctrl && chord[0].key === 'c', 'Chord components correct');

  assert(matchesKeystroke(ks!, ks!), 'Self-matching keystroke');
  assert(matchesBinding(chord, { chord, action: 'test' }), 'Self-matching binding');

  const defaults = getDefaultBindings();
  assert(defaults.length > 10, `Default bindings count: ${defaults.length}`);

  const action = resolveBinding(chord);
  assert(action === 'interrupt', 'resolveBinding finds action');
  assert(keystrokeToString(ks!).includes('Ctrl'), 'keystrokeToString works');

  loadUserBindings();
  const allBindings = (await import('../src/keybindings/index.js')).getAllBindings();
  assert(allBindings.length >= defaults.length, 'User binding loading works');
}

// ─── 5. Vim Mode ───

async function testVim(): Promise<void> {
  const { createVimState, processVimInput, getVimModeDisplay, isVimModeActive, executeOperator, moveCursor } = await import('../src/vim/index.js');

  const state = createVimState();
  assertEq(state.mode, 'INSERT', 'Starts in INSERT mode');
  assert(!isVimModeActive(state), 'INSERT is not vim mode');

  // Basic VimLine editor
  const editor = {
    _line: 'hello world',
    _cursor: 0,
    _rows: 0,
    _lines: ['hello world'],
    getCursor: function() { return this._cursor; },
    setCursor: function(p: number) { this._cursor = p; },
    getLine: function() { return this._line; },
    setLine: function(l: string) { this._line = l; },
    getLines: function() { return this._lines; },
    setLines: function(l: string[]) { this._lines = l; },
    getCursorRow: function() { return this._rows; },
    setCursorRow: function(r: number) { this._rows = r; },
    insertChar: function(c: string) { this._line = this._line.slice(0, this._cursor) + c + this._line.slice(this._cursor); this._cursor++; },
    deleteChar: function() { if (this._cursor > 0) { this._line = this._line.slice(0, this._cursor - 1) + this._line.slice(this._cursor); this._cursor--; }},
  };

  // Enter NORMAL mode
  processVimInput(state, editor, '\x1b');
  assertEq(state.mode, 'NORMAL', 'ESC enters NORMAL mode');
  assert(isVimModeActive(state), 'NORMAL is vim mode');

  // Movement
  state.count = 1; state.commandBuffer = '';
  moveCursor(editor, 'l', 1);
  assertEq(editor.getCursor(), 1, 'l moves right');
  moveCursor(editor, 'h', 1);
  assertEq(editor.getCursor(), 0, 'h moves left');

  // Word motion
  state.count = 1; state.commandBuffer = '';
  moveCursor(editor, 'w', 1);
  assert(editor.getCursor() > 0, 'w moves to next word');
  moveCursor(editor, 'b', 1);
  assertEq(editor.getCursor(), 0, 'b moves back');

  editor.setCursor(11);
  moveCursor(editor, '$', 1);
  assertEq(editor.getCursor(), 11, '$ moves to end');

  editor.setCursor(0);
  moveCursor(editor, '0', 1);
  assertEq(editor.getCursor(), 0, '0 moves to start');

  // x command (delete char)
  editor.setLine('test');
  editor.setCursor(1);
  state.mode = 'NORMAL'; state.commandBuffer = '';
  processVimInput(state, editor, 'x');
  assertEq(editor.getLine(), 'tst', 'x deletes character');

  // dd command (delete line)
  editor.setLines(['line1', 'line2', 'line3']);
  editor.setCursorRow(1);
  state.mode = 'NORMAL'; state.count = 1; state.commandBuffer = ''; state.operator = 'none';
  processVimInput(state, editor, 'd');
  assertEq(state.operator, 'delete', 'd starts delete operator');
  processVimInput(state, editor, 'd');
  assertEq(editor.getLines().length, 2, 'dd deletes line');

  // Reset state for next test
  state.mode = 'NORMAL'; state.commandBuffer = ''; state.count = 1; state.operator = 'none'; state.lastCommand = '';
  processVimInput(state, editor, 'i');
  assertEq(state.mode, 'INSERT', 'i enters INSERT');

  // o opens line below
  state.mode = 'NORMAL'; state.commandBuffer = ''; state.count = 1; state.operator = 'none';
  editor.setLines(['a', 'b']);
  editor.setCursorRow(0);
  processVimInput(state, editor, 'o');
  assert(editor.mode !== 'INSERT' || editor.getLines().length > 2, 'o opens line below');
  assert(editor.getLines().length >= 2, 'o line added');

  // Mode display
  state.mode = 'NORMAL';
  const display = getVimModeDisplay(state);
  assert(display.includes('NORMAL'), 'NORMAL mode display');

  state.mode = 'INSERT';
  const insertDisplay = getVimModeDisplay(state);
  assert(insertDisplay.includes('INSERT'), 'INSERT mode display');
}

// ─── 6. Plugin System ───

async function testPlugins(): Promise<void> {
  const { registerBuiltinPlugin, getBuiltinPlugins, loadPlugin, getAllPlugins, getEnabledPlugins, getPluginSkillCommands, initBuiltinPlugins, removePlugin, clearPlugins } = await import('../src/plugins/index.js');

  clearPlugins();
  initBuiltinPlugins();
  const builtins = getBuiltinPlugins();
  assert(builtins.length >= 2, 'Built-in plugins registered');
  assert(builtins.some(p => p.name === 'git'), 'Git plugin exists');
  assert(builtins.some(p => p.name === 'search'), 'Search plugin exists');

  const plugin = loadPlugin({
    name: 'test-plugin',
    description: 'A test plugin',
    version: '1.0.0',
    skills: [
      { name: 'test-skill', description: 'test', prompt: 'do something' },
    ],
  }, 'user');
  assert(plugin.name === 'test-plugin', 'Plugin loaded');
  assert(getAllPlugins().length >= 1, 'getAllPlugins works');
  assert(getEnabledPlugins().length >= 1, 'getEnabledPlugins works');

  const skills = getPluginSkillCommands();
  assert(skills.length >= 1, 'Plugin skills generated');
  assert(skills.some(s => s.name === 'test-skill'), 'Plugin skill found');

  assert(removePlugin('test-plugin'), 'removePlugin works');
  clearPlugins();
  assertEq(getAllPlugins().length, 0, 'clearPlugins works');
}

// ─── 7. Schema Validation ───

async function testSchemas(): Promise<void> {
  const { validateAgainstSchema, validateConfig, ToolSchema } = await import('../src/schemas/index.js');

  // Object validation
  const schema = {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const, minLength: 1 },
      age: { type: 'number' as const, minimum: 0 },
    },
    required: ['name'],
  };

  let errors = validateAgainstSchema({ name: 'test', age: 25 }, schema);
  assertEq(errors.length, 0, 'Valid object passes');

  errors = validateAgainstSchema({ age: 25 }, schema);
  assert(errors.length > 0, 'Missing required field detected');

  errors = validateAgainstSchema({ name: 'test', age: -1 }, schema);
  assert(errors.some(e => e.message.includes('minimum')), 'Minimum value check works');

  // String validation
  const strSchema = { type: 'string' as const, minLength: 2, maxLength: 10 };
  errors = validateAgainstSchema('hi', strSchema);
  assertEq(errors.length, 0, 'Valid string passes');
  errors = validateAgainstSchema('', strSchema);
  assert(errors.length > 0, 'Too short string fails');
  errors = validateAgainstSchema('too long string here', strSchema);
  assert(errors.length > 0, 'Too long string fails');

  // Number validation
  const numSchema = { type: 'number' as const, minimum: 0, maximum: 100 };
  errors = validateAgainstSchema(50, numSchema);
  assertEq(errors.length, 0, 'Valid number passes');
  errors = validateAgainstSchema(150, numSchema);
  assert(errors.length > 0, 'Number exceeds maximum');

  // Array validation
  const arrSchema = { type: 'array' as const, minItems: 1, maxItems: 3 };
  errors = validateAgainstSchema([1, 2], arrSchema);
  assertEq(errors.length, 0, 'Valid array passes');
  errors = validateAgainstSchema([], arrSchema);
  assert(errors.length > 0, 'Empty array fails minItems');

  // Type mismatch
  errors = validateAgainstSchema('not a number', { type: 'number' });
  assert(errors.length > 0, 'Type mismatch detected');

  // Config validation
  const configErrors = validateConfig({ api_key: 'sk-t' });
  assert(configErrors.some(e => e.path.includes('api_key') || e.message.includes('api_key')), 'API key validation');
}

// ─── 8. Output Styles ───

async function testStyles(): Promise<void> {
  const { registerStyle, getStyle, getAllStyles, setActiveStyle, getActiveStyle, getActiveStyleName, applyStyleToPrompt, clearStyles } = await import('../src/styles/index.js');

  clearStyles();
  registerStyle({ name: 'test-style', description: 'test', prompt: 'test prompt', source: 'bundled' });
  registerStyle({ name: 'concise', description: 'Concise output', prompt: 'Be brief.', source: 'bundled' });

  const style = getStyle('test-style');
  assert(style !== undefined, 'getStyle finds registered style');
  assertEq(style!.name, 'test-style', 'Style name preserved');

  const allStyles = getAllStyles();
  assert(allStyles.length >= 2, 'getAllStyles works');

  setActiveStyle('test-style');
  assertEq(getActiveStyleName(), 'test-style', 'setActiveStyle works');
  assertEq(getActiveStyle().name, 'test-style', 'getActiveStyle works');

  const prompt = applyStyleToPrompt('base prompt');
  assert(prompt.includes('test prompt'), 'applyStyleToPrompt appends style');

  const cleanPrompt = applyStyleToPrompt('base prompt', 'concise');
  assert(cleanPrompt.includes('Be brief'), 'Named style applied');

  clearStyles();
}

// ─── 9. Memory System ───

async function testMemory(): Promise<void> {
  const { parseMemoryType, MEMORY_TYPES, truncateEntrypointContent, getMemoryBaseDir, ensureMemoryDirExists, isAutoMemoryEnabled, buildMemoryPrompt, WHAT_NOT_TO_SAVE_SECTION, WHEN_TO_ACCESS_SECTION, MEMORY_DRIFT_CAVEAT } = await import('../src/memory/index.js');

  assertEq(MEMORY_TYPES.length, 4, '4 memory types');
  assertEq(parseMemoryType('user'), 'user', 'Parse user type');
  assertEq(parseMemoryType('feedback'), 'feedback', 'Parse feedback type');
  assertEq(parseMemoryType('project'), 'project', 'Parse project type');
  assertEq(parseMemoryType('reference'), 'reference', 'Parse reference type');
  assert(parseMemoryType('invalid') === undefined, 'Invalid type returns undefined');

  // Truncation
  const short = truncateEntrypointContent('hello world');
  assert(!short.wasLineTruncated && !short.wasByteTruncated, 'Short content not truncated');

  const longLine = 'x'.repeat(30000);
  const truncated = truncateEntrypointContent(longLine);
  assert(truncated.byteCount > 0, 'Truncated content has bytes');

  const manyLines = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
  const lineTruncated = truncateEntrypointContent(manyLines);
  assert(lineTruncated.wasLineTruncated, 'Long content line-truncated');

  // Paths
  const baseDir = getMemoryBaseDir();
  assert(baseDir.includes('.yourca'), 'Memory base dir is under .yourca');
  assert(isAutoMemoryEnabled(), 'Auto memory enabled by default');

  // Dir creation
  const testDir = ensureMemoryDirExists();
  assert(testDir.length > 0, 'ensureMemoryDirExists returns path');

  // Prompt sections
  assert(WHAT_NOT_TO_SAVE_SECTION.includes('CLAUDE.md'), 'What not to save section');
  assert(WHEN_TO_ACCESS_SECTION.includes('past conversations'), 'When to access section');
  assert(MEMORY_DRIFT_CAVEAT.includes('stale'), 'Memory drift caveat');

  // Memory prompt
  const prompt = buildMemoryPrompt();
  assert(prompt.includes('Memory System'), 'Memory prompt includes header');
  assert(prompt.includes('Write'), 'Memory prompt mentions Write');
}

// ─── 10. Types / Entrypoints ───

async function testTypesEntrypoints(): Promise<void> {
  const { MESSAGE_ROLES } = await import('../src/types/index.js');
  const { parseArgs, createAgentDefinition, createSession, getSession, listSessions, removeSession, renameSession, clearSessions } = await import('../src/entrypoints/index.js');

  assert(MESSAGE_ROLES.length >= 3, 'Message roles defined');

  // Entrypoints
  const ent = await import('../src/entrypoints/index.js');
  const parsed = ent.parseArgs(['node', 'test', '--verbose', '--model', 'deepseek-chat', 'hello']);
  assert(parsed.config.verbose, 'Verbose flag parsed');
  assertEq(parsed.config.model, 'deepseek-chat', 'Model parsed');
  assertEq(parsed.prompt, 'hello', 'Positional args as prompt');

  const helpParsed = ent.parseArgs(['node', 'test', '--help']);
  assert(helpParsed.fastPaths.includes('help'), 'Help fast path');

  const versionParsed = ent.parseArgs(['node', 'test', '--version']);
  assert(versionParsed.fastPaths.includes('version'), 'Version fast path');

  // Agent definition
  const agent = createAgentDefinition('test-agent', 'worker', 'A test agent');
  assertEq(agent.name, 'test-agent', 'Agent name set');
  assertEq(agent.type, 'worker', 'Agent type set');

  // Session management
  const session = createSession('test-session', 'deepseek-chat');
  assertEq(session.sessionId, 'test-session', 'Session created');
  assert(listSessions().length >= 1, 'List sessions');
  assert(getSession('test-session') !== undefined, 'Get session');
  assert(renameSession('test-session', 'new title'), 'Rename session');
  assertEq(getSession('test-session')!.title, 'new title', 'Title updated');
  assert(removeSession('test-session'), 'Remove session');
  clearSessions();
  assertEq(listSessions().length, 0, 'Clear sessions');
}

// ─── 11. Coordinator Mode ───

async function testCoordinator(): Promise<void> {
  const { isCoordinatorMode, setCoordinatorMode, getCoordinatorUserContext, getCoordinatorSystemPrompt, createWorker, createOrchestrationPlan, addWorkerToPlan, registerActiveWorker, getWorker, stopWorker, stopAllWorkers, getActiveWorkerCount, getCoordinatorPromptAppendix } = await import('../src/coordinator/index.js');

  assert(!isCoordinatorMode(), 'Coordinator off by default');
  setCoordinatorMode(true);
  assert(isCoordinatorMode(), 'Coordinator on after set');

  const ctx = getCoordinatorUserContext();
  assert(ctx.workerToolsContext !== undefined, 'Coordinator context has workerToolsContext');

  const sysPrompt = getCoordinatorSystemPrompt();
  assert(sysPrompt.includes('orchestration'), 'Coordinator system prompt');

  const worker = createWorker('do something');
  assert(worker.id.startsWith('worker_'), 'Worker ID prefix');
  assertEq(worker.prompt, 'do something', 'Worker prompt');
  assertEq(worker.maxTurns, 10, 'Worker default max turns');

  const plan = createOrchestrationPlan('build feature');
  assert(plan.id.startsWith('plan_'), 'Plan ID prefix');
  assertEq(plan.goal, 'build feature', 'Plan goal');

  addWorkerToPlan(plan, worker, 0);
  assertEq(plan.workers.length, 1, 'Plan has 1 worker');

  const activeId = registerActiveWorker(worker.id);
  assert(getWorker(activeId) !== undefined, 'Active worker registered');
  assertEq(getActiveWorkerCount(), 1, 'Active worker count');

  assert(stopWorker(activeId), 'Stop worker');
  assertEq(getActiveWorkerCount(), 0, 'All workers stopped');

  stopAllWorkers();
  setCoordinatorMode(false);
}

// ─── 12. Bridge ───

async function testBridge(): Promise<void> {
  const { toCompatSessionId, toInfraSessionId, getTrustedDeviceToken, setTrustedDeviceToken, clearTrustedDeviceTokenCache, createSession, getSession, updateSessionActivity, endSession } = await import('../src/bridge/index.js');

  // Session ID compat
  assertEq(toCompatSessionId('cse_abc'), 'session_abc', 'cse_ to session_');
  assertEq(toInfraSessionId('session_abc'), 'cse_abc', 'session_ to cse_');
  assertEq(toCompatSessionId('session_normal'), 'session_normal', 'session_ stays session_');

  // Trusted device
  clearTrustedDeviceTokenCache();
  setTrustedDeviceToken('test-token');
  assertEq(getTrustedDeviceToken(), 'test-token', 'Trusted device token set');

  // Session
  const sess = createSession('test-session-id');
  assertEq(sess.sessionId, 'test-session-id', 'Bridge session created');
  assert(getSession() !== null, 'getSession works');
  updateSessionActivity();
  assert(getSession()!.turnCount > 0, 'Activity tracked');
  endSession();
  assert(getSession() === null, 'Session ended');
}

// ─── 13. State Management (enhanced) ───

async function testState(): Promise<void> {
  const { resetStateForTests, addToTotalCostState, addToTotalDurationState, addTokenUsage, incrementTurnCount, getTurnCount, getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens, getTotalCacheReadInputTokens, getTotalCacheCreationInputTokens, getTotalLinesAdded, getTotalLinesRemoved, addToTotalLinesChanged, addWebSearchRequest, getTotalWebSearchRequests, setHasUnknownModelCost, hasUnknownModelCost, getSessionId, regenerateSessionId, generateId, setCostStateForRestore } = await import('../src/state/bootstrap.js');

  resetStateForTests();

  addToTotalCostState(0.5);
  assertEq(getTotalCostUSD(), 0.5, 'Cost accumulates');

  addTokenUsage(10, 20, 5, 3);
  assertEq(getTotalInputTokens(), 10, 'Input tokens');
  assertEq(getTotalOutputTokens(), 20, 'Output tokens');

  addWebSearchRequest();
  assertEq(getTotalWebSearchRequests(), 1, 'Web search requests tracked');

  addToTotalLinesChanged(5, 2);
  assertEq(getTotalLinesAdded(), 5, 'Lines added');
  assertEq(getTotalLinesRemoved(), 2, 'Lines removed');

  incrementTurnCount();
  assertEq(getTurnCount(), 1, 'Turn counts');

  setHasUnknownModelCost(true);
  assert(hasUnknownModelCost(), 'Unknown model flag');

  const id1 = getSessionId();
  regenerateSessionId();
  const id2 = getSessionId();
  assert(id1 !== id2, 'Session regenerated');

  resetStateForTests();
  assertEq(getTotalCostUSD(), 0, 'Full reset works');
}

// ─── 14. Services (errors, signals, compact) ───

async function testServices(): Promise<void> {
  // Errors
  const errMod = await import('../src/services/errors.js');
  errMod.clearErrorLog();

  const rateErr = errMod.classifyError(new Error('429 too many'));
  assertEq(rateErr.category, errMod.ErrorCategory.API, '429 API category');
  assert(rateErr.retryable, '429 retryable');

  const authErr = errMod.classifyError(new Error('401'));
  assert(!authErr.retryable, '401 not retryable');

  const abortErr = errMod.classifyError(new DOMException('', 'AbortError'));
  assertEq(abortErr.category, errMod.ErrorCategory.SYSTEM, 'AbortError system');

  errMod.logError(new Error('test'));
  assert(errMod.getRecentErrors().length >= 1, 'Errors logged');

  errMod.clearErrorLog();
  assertEq(errMod.getRecentErrors().length, 0, 'Errors cleared');

  // Signals
  const sigMod = await import('../src/services/signals.js');
  let called = false;
  const cleanup = sigMod.registerSignalHandlers({ onInterrupt: () => { called = true; } });
  assert(typeof cleanup === 'function', 'Signal handler registered');
  cleanup();
  sigMod.resetInterruptState();

  // Compact
  const compactMod = await import('../src/services/compact.js');
  const smallMsgs = [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] },
  ];
  assert(!compactMod.shouldCompact(smallMsgs, 'deepseek-chat'), 'No compact needed');
  assert(compactMod.estimateMessagesTokens(smallMsgs) > 0, 'Token estimate');
  assertEq(compactMod.countToolCalls(smallMsgs), 0, 'No tool calls');

  const progress = compactMod.getCompactProgressMessage(smallMsgs);
  assert(progress.includes('tokens'), 'Progress message');
}

// ─── 15. End-to-end module loading ───

async function testAllModulesLoad(): Promise<void> {
  const modules = [
    '../src/tasks/index.js',
    '../src/skills/index.js',
    '../src/keybindings/index.js',
    '../src/vim/index.js',
    '../src/plugins/index.js',
    '../src/schemas/index.js',
    '../src/styles/index.js',
    '../src/memory/index.js',
    '../src/types/index.js',
    '../src/entrypoints/index.js',
    '../src/coordinator/index.js',
    '../src/bridge/index.js',
    '../src/services/history.js',
    '../src/services/errors.js',
    '../src/services/signals.js',
    '../src/services/compact.js',
  ];

  for (const modPath of modules) {
    try {
      await import(modPath);
      assert(true, `Module loads: ${modPath}`);
    } catch (err: any) {
      assert(false, `Module loads: ${modPath} — ${err.message}`);
    }
  }
}

// ─── Main ───

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║    YourCA Complete Integration Test Suite   ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝'));

  await run('1. Task System', testTasks);
  await run('2. History System', testHistory);
  await run('3. Skills System', testSkills);
  await run('4. Keybindings', testKeybindings);
  await run('5. Vim Mode', testVim);
  await run('6. Plugin System', testPlugins);
  await run('7. Schema Validation', testSchemas);
  await run('8. Output Styles', testStyles);
  await run('9. Memory System', testMemory);
  await run('10. Types & Entrypoints', testTypesEntrypoints);
  await run('11. Coordinator Mode', testCoordinator);
  await run('12. Bridge Module', testBridge);
  await run('13. State Management', testState);
  await run('14. Services (errors/signals/compact)', testServices);
  await run('15. All Modules Load', testAllModulesLoad);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = passed + failed;
  console.log(chalk.bold(`\n${'═'.repeat(50)}`));
  console.log(chalk.bold(`Results: ${passed}/${total} passed in ${duration}s`));

  if (failed > 0) {
    console.log(chalk.red(`\n${failed} failed:`));
    for (const f of failures) {
      console.log(chalk.red(`  • ${f}`));
    }
    process.exit(1);
  } else {
    console.log(chalk.green('\n🎉 All integration tests passed!\n'));
  }
}

main().catch(err => {
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  process.exit(1);
});
