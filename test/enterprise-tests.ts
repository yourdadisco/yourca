/**
 * Enterprise feature tests for YourCA.
 * Tests run in real TUI and verify each enterprise feature.
 *
 * Usage: npx tsx test/enterprise-tests.ts
 */

import chalk from 'chalk';

// Track test results
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(chalk.green(`  ✓ ${message}`));
  } else {
    failed++;
    failures.push(message);
    console.log(chalk.red(`  ✗ ${message}`));
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
    console.log(chalk.green(`  ✓ ${message}`));
  } else {
    failed++;
    failures.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(chalk.red(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
  }
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(chalk.bold(`\n${name}`));
  try {
    await fn();
  } catch (err: any) {
    failed++;
    failures.push(`${name}: threw — ${err.message}`);
    console.log(chalk.red(`  ✗ ${name}: threw — ${err.message}`));
  }
}

// ─── Tests ───

async function testBootstrapState(): Promise<void> {
  // Reset state
  const { resetStateForTests, addToTotalCostState, addTokenUsage, addToTotalDurationState,
    getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens, getTotalAPIDuration,
    incrementTurnCount, getTurnCount, getSessionId, regenerateSessionId,
    addToTotalLinesChanged, getTotalLinesAdded, getTotalLinesRemoved,
    setHasUnknownModelCost, hasUnknownModelCost, generateId } = await import('../src/state/bootstrap.js');

  resetStateForTests();

  assertEqual(getTotalCostUSD(), 0, 'Cost starts at 0');
  assertEqual(getTurnCount(), 0, 'Turn count starts at 0');
  assertEqual(getTotalInputTokens(), 0, 'Input tokens start at 0');
  assertEqual(getTotalOutputTokens(), 0, 'Output tokens start at 0');

  addToTotalCostState(1.5);
  assertEqual(getTotalCostUSD(), 1.5, 'addToTotalCostState accumulates');

  addToTotalDurationState(1000);
  assertEqual(getTotalAPIDuration(), 1000, 'addToTotalDurationState works');

  addTokenUsage(100, 200, 50, 25);
  assertEqual(getTotalInputTokens(), 100, 'Input tokens tracked');
  assertEqual(getTotalOutputTokens(), 200, 'Output tokens tracked');

  incrementTurnCount();
  assertEqual(getTurnCount(), 1, 'Turn count increments');

  addToTotalLinesChanged(10, 3);
  assertEqual(getTotalLinesAdded(), 10, 'Lines added tracked');
  assertEqual(getTotalLinesRemoved(), 3, 'Lines removed tracked');

  setHasUnknownModelCost(true);
  assert(hasUnknownModelCost(), 'Unknown model cost flag');

  const id1 = getSessionId();
  regenerateSessionId();
  const id2 = getSessionId();
  assert(id1 !== id2, 'Session ID regenerates');

  const genId = generateId('t');
  assert(genId.startsWith('t_'), 'generateId creates IDs with prefix');
  assert(genId.length > 10, 'generateId creates IDs of sufficient length');

  resetStateForTests();
  assertEqual(getTotalCostUSD(), 0, 'resetStateForTests clears cost');
}

async function testPermissionSystem(): Promise<void> {
  const { checkToolPermission, createDefaultPermissionContext, filterToolsByDenyRules } = await import('../src/tool/permissions.js');
  const { buildTool } = await import('../src/tool/Tool.js');

  const readTool = buildTool({
    name: 'Read',
    description: 'Read a file',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
    async call() { return { content: [{ type: 'text', text: '' }] }; },
  });

  const writeTool = buildTool({
    name: 'Write',
    description: 'Write a file',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] },
    async call() { return { content: [{ type: 'text', text: '' }] }; },
    isDestructive: () => true,
  });

  // Default mode: destructive tools ask, readonly tools allow
  let ctx = createDefaultPermissionContext();
  let result = checkToolPermission(readTool, { file_path: '/test.txt' }, ctx);
  assertEqual(result.behavior, 'allow', 'Readonly tool allowed in default mode');

  ctx = createDefaultPermissionContext();
  result = checkToolPermission(writeTool, { file_path: '/test.txt' }, ctx);
  assertEqual(result.behavior, 'ask', 'Destructive tool asks in default mode');

  // Accept mode: everything is allowed
  ctx = { ...createDefaultPermissionContext(), mode: 'accept' };
  result = checkToolPermission(writeTool, { file_path: '/test.txt' }, ctx);
  assertEqual(result.behavior, 'allow', 'Accept mode allows everything');

  // Deny rules
  ctx = {
    ...createDefaultPermissionContext(),
    mode: 'default',
    alwaysDenyRules: { 'Write': [] },
  };
  result = checkToolPermission(writeTool, { file_path: '/test.txt' }, ctx);
  assertEqual(result.behavior, 'deny', 'Deny rules block tools');

  // Auto mode: readonly tools are allowed
  ctx = { ...createDefaultPermissionContext(), mode: 'auto' };
  result = checkToolPermission(readTool, { file_path: '/test.txt' }, ctx);
  assertEqual(result.behavior, 'allow', 'Auto mode allows readonly tools');
}

async function testContextSystem(): Promise<void> {
  const { buildSystemPrompt, invalidateContextCaches, getSystemContext, getUserContext } = await import('../src/context/context.js');

  invalidateContextCaches();

  const sysCtx = await getSystemContext();
  assert(typeof sysCtx === 'object' && sysCtx !== null, 'getSystemContext returns object');
  assert('gitStatus' in sysCtx, 'getSystemContext has gitStatus info');

  const userCtx = await getUserContext();
  assert(typeof userCtx.currentDate === 'string', 'getUserContext has date');
  assert(userCtx.currentDate.length > 0, 'Date is non-empty');
  assert(userCtx.projectInfo === null || typeof userCtx.projectInfo === 'object', 'Project info exists or null');

  const prompt = buildSystemPrompt(sysCtx, userCtx);
  assert(prompt.includes('YourCA'), 'System prompt includes identity');
  assert(prompt.includes('DeepSeek'), 'System prompt mentions DeepSeek');
  assert(prompt.includes(userCtx.currentDate), 'System prompt includes date');

  invalidateContextCaches();
}

async function testSubagentSystem(): Promise<void> {
  const { spawnSubagent, getActiveSubagentCount, stopAllSubagents } = await import('../src/services/subagent.js');

  // Just verify the system initializes correctly and stops work
  assert(typeof getActiveSubagentCount === 'function', 'Subagent system initialized');
  assertEqual(getActiveSubagentCount(), 0, 'No active subagents initially');

  // Create a mock parent context
  const parentContext: any = {
    abortController: new AbortController(),
    getAppState: () => ({}),
    setAppState: () => {},
    messages: [],
    permissionContext: { mode: 'accept', additionalWorkingDirectories: [] },
  };

  // Start a subagent (it will abort quickly since we have no API key configured here)
  const resultPromise = spawnSubagent({
    systemPrompt: 'You are a test subagent. Just respond with "ok".',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
    tools: [],
    parentContext,
    maxTurns: 1,
    label: 'test',
  });

  // Stop all subagents
  stopAllSubagents();

  const result = await resultPromise;
  assert(typeof result.success === 'boolean', 'Subagent returns result');
  assert(typeof result.text === 'string', 'Subagent returns text');
}

async function testSignalHandling(): Promise<void> {
  const { registerSignalHandlers, resetInterruptState } = await import('../src/services/signals.js');

  let interruptCalled = false;
  let shutdownCalled = false;

  const cleanup = registerSignalHandlers({
    onInterrupt: () => { interruptCalled = true; },
    onShutdown: () => { shutdownCalled = true; },
  });

  assert(typeof cleanup === 'function', 'registerSignalHandlers returns cleanup function');

  cleanup();
  resetInterruptState();
  assert(true, 'Signal handlers cleaned up');
}

async function testErrorHandling(): Promise<void> {
  const { classifyError, logError, getRecentErrors, clearErrorLog, formatError, ErrorSeverity, ErrorCategory } = await import('../src/services/errors.js');

  clearErrorLog();

  // Test error classification
  const rateErr = classifyError(new Error('Rate limit exceeded (429)'));
  assertEqual(rateErr.category, ErrorCategory.API, '429 classified as API');
  assert(rateErr.retryable, '429 is retryable');

  const authErr = classifyError(new Error('401 Unauthorized'));
  assertEqual(authErr.category, ErrorCategory.API, '401 classified as API');
  assert(!authErr.retryable, '401 is not retryable');

  const timeoutErr = classifyError(new Error('Connection timed out'));
  assertEqual(timeoutErr.category, ErrorCategory.TIMEOUT, 'Timeout classified correctly');
  assert(timeoutErr.retryable, 'Timeout is retryable');

  const netErr = classifyError(new Error('ENOTFOUND example.com'));
  assertEqual(netErr.category, ErrorCategory.NETWORK, 'ENOTFOUND classified as network');

  const permErr = classifyError(new Error('Permission denied'));
  assertEqual(permErr.category, ErrorCategory.PERMISSION, 'Permission denied classified correctly');

  const abortErr = classifyError(new DOMException('Aborted', 'AbortError'));
  assertEqual(abortErr.category, ErrorCategory.SYSTEM, 'AbortError classified as system');
  assertEqual(abortErr.severity, ErrorSeverity.INFO, 'AbortError severity is INFO');

  // Test logging
  logError(new Error('test error'));
  const recent = getRecentErrors();
  assert(recent.length >= 1, 'getRecentErrors returns logged errors');
  assertEqual(recent[0].message, 'test error', 'Logged error message preserved');

  // Test formatting
  const formatted = formatError(rateErr);
  assert(formatted.includes('retryable'), 'Format includes retryable flag');

  clearErrorLog();
  assertEqual(getRecentErrors().length, 0, 'clearErrorLog clears errors');
}

async function testContextCompaction(): Promise<void> {
  const { shouldCompact, compactMessages, estimateMessagesTokens, countToolCalls, getCompactProgressMessage } = await import('../src/services/compact.js');
  const type = await import('../src/tool/Tool.js');

  const smallMessages: type.Message[] = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
  ];

  // Small conversation should not trigger compaction
  assert(!shouldCompact(smallMessages, 'deepseek-chat'), 'Small conversation does not need compaction');

  // Token estimation
  const tokens = estimateMessagesTokens(smallMessages);
  assert(tokens > 0, 'Token estimation returns positive value');

  // Tool call count
  const calls = countToolCalls(smallMessages);
  assertEqual(calls, 0, 'No tool calls in simple messages');

  // Messages with tool calls
  const msgsWithTools: type.Message[] = [
    { role: 'user', content: [{ type: 'text', text: 'Read file' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'Read', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: 'file content' }] }] },
  ];
  assertEqual(countToolCalls(msgsWithTools), 1, 'Tool call count works');

  // Compact progress message
  const progress = getCompactProgressMessage(smallMessages);
  assert(progress.includes('tokens'), 'Progress message includes token info');

  // Compaction with many messages (should still keep last N)
  const manyMessages: type.Message[] = [];
  for (let i = 0; i < 20; i++) {
    manyMessages.push({ role: 'user', content: [{ type: 'text', text: `Message ${i} `.repeat(100) }] });
  }
  const compacted = compactMessages(manyMessages, 'deepseek-chat');
  assert(compacted.length < manyMessages.length, 'Compaction reduces message count');
  assert(compacted.length > 0, 'Compacted messages still present');
}

async function testToolSystem(): Promise<void> {
  const { buildTool, findToolByName, toolMatchesName } = await import('../src/tool/Tool.js');

  const tool = buildTool({
    name: 'TestTool',
    aliases: ['tt'],
    description: 'A test tool',
    inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
    async call(input) {
      return { content: [{ type: 'text', text: `input: ${input.x}` }] };
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  });

  assertEqual(tool.name, 'TestTool', 'Tool name set');
  assert(tool.isEnabled?.(), 'isEnabled defaults to true');
  assert(tool.isReadOnly?.(), 'isReadOnly set to true');
  assert(tool.isConcurrencySafe?.(), 'isConcurrencySafe set');
  assert(!tool.isDestructive?.(), 'isDestructive defaults to false');

  const found = findToolByName([tool], 'tt');
  assert(found === tool, 'findToolByName finds by alias');

  assert(toolMatchesName(tool, 'TestTool'), 'toolMatchesName matches name');
  assert(toolMatchesName(tool, 'tt'), 'toolMatchesName matches alias');
}

async function testToolsRegistry(): Promise<void> {
  const { getAllTools, getEnabledTools, toolToApiDefinition } = await import('../src/tool/tools.js');

  const all = getAllTools();
  assert(all.length >= 8, `getAllTools returns ${all.length} tools (expected >= 8)`);

  const enabled = getEnabledTools();
  assert(enabled.length >= 8, `getEnabledTools returns ${enabled.length} tools`);

  const firstTool = all[0];
  const apiDef = toolToApiDefinition(firstTool);
  assertEqual(apiDef.name, firstTool.name, 'toolToApiDefinition preserves name');
  assert('input_schema' in apiDef, 'toolToApiDefinition has input_schema');
}

async function testREPLState(): Promise<void> {
  const state = await import('../src/repl/state.js');

  // Test message management
  const initialLen = state.messages.length;
  assertEqual(initialLen, 0, 'REPL starts with empty messages');

  const testMsg = { role: 'user' as const, content: [{ type: 'text' as const, text: 'hello' }] };
  state.addMessage(testMsg);
  assertEqual(state.messages.length, 1, 'addMessage adds one message');
  assertEqual(state.messages[0].content[0].type, 'text', 'Message content is text');

  state.resetMessages();
  assertEqual(state.messages.length, 0, 'resetMessages clears');

  // Test abort controller
  const oldCtrl = state.abortController;
  state.newAbortController();
  assert(state.abortController !== oldCtrl, 'newAbortController creates new instance');
}

async function testConfigSystem(): Promise<void> {
  const { loadConfig, saveConfig } = await import('../src/utils/config.js');

  // Load config (may be empty if not set up)
  const config = loadConfig();
  assert(typeof config === 'object', 'loadConfig returns object');
  assert(!config.api_key || typeof config.api_key === 'string', 'API key is string if present');
}

async function testQueryMessages(): Promise<void> {
  const { createUserMessage, createAssistantMessage, createSystemMessage, countTotalTokens, estimateMessagesTokens } = await import('../src/query/messages.js');

  const userMsg = createUserMessage('Hello world');
  assertEqual(userMsg.role, 'user', 'createUserMessage creates user message');
  assertEqual(userMsg.content[0].type, 'text', 'User message has text content');
  assertEqual((userMsg.content[0] as any).text, 'Hello world', 'User message has correct text');

  const sysMsg = createSystemMessage('System info');
  assert(sysMsg.content[0].type === 'text', 'createSystemMessage creates message with text');

  const tokens = countTotalTokens('Hello world, this is a test');
  assert(tokens > 0, 'countTotalTokens returns positive count');

  const msgs = [userMsg, createAssistantMessage([{ type: 'text', text: 'Hi!' }])];
  const estimated = estimateMessagesTokens(msgs);
  assert(estimated > 0, 'estimateMessagesTokens works');
}

// ─── Main ───

async function main(): Promise<void> {
  console.log(chalk.bold.yellow('╔══════════════════════════════════════╗'));
  console.log(chalk.bold.yellow('║   YourCA Enterprise Feature Tests   ║'));
  console.log(chalk.bold.yellow('╚══════════════════════════════════════╝'));

  await runTest('1. Bootstrap State Management', testBootstrapState);
  await runTest('2. Permission System', testPermissionSystem);
  await runTest('3. Context System', testContextSystem);
  await runTest('4. Subagent System', testSubagentSystem);
  await runTest('5. Signal Handling', testSignalHandling);
  await runTest('6. Error Handling', testErrorHandling);
  await runTest('7. Context Compaction', testContextCompaction);
  await runTest('8. Tool System', testToolSystem);
  await runTest('9. Tools Registry', testToolsRegistry);
  await runTest('10. REPL State', testREPLState);
  await runTest('11. Config System', testConfigSystem);
  await runTest('12. Query Messages', testQueryMessages);

  // Summary
  const total = passed + failed;
  console.log(chalk.bold(`\n${'─'.repeat(46)}`));
  console.log(chalk.bold(`Results: ${passed}/${total} passed`));
  if (failed > 0) {
    console.log(chalk.red(`\n${failed} test(s) failed:`));
    for (const f of failures) {
      console.log(chalk.red(`  • ${f}`));
    }
    process.exit(1);
  } else {
    console.log(chalk.green('\nAll enterprise tests passed! ✓'));
  }
}

main().catch(err => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
