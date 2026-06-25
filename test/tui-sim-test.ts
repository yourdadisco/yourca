/**
 * TUI simulation test: tests all commands through their module APIs
 * as they would be called from the REPL.
 */
import { findCommand } from '../src/commands/index.js';

async function testCommand(name: string, args: string = '') {
  const cmd = findCommand(name);
  if (!cmd) { console.log(`❌ /${name} - COMMAND NOT FOUND`); return false; }
  console.log(`\n=== /${name} ${args} ===`);
  const context = { tools: [], toolUseContext: {} as any, getMessages: () => [], setMessages: () => {}, systemPrompt: '', abortController: new AbortController(), requestUserInput: () => '' };
  // Capture console.log output
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => { origLog(...args); };
  try {
    await cmd.action!(args, context as any);
    console.log = origLog;
    return true;
  } catch (err: any) {
    console.log = origLog;
    console.log(`❌ Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n=== TUI Simulation Test ===\n');

  const tests = [
    ['memory', ''],
    ['role', ''],
    ['goal', ''],
    ['goal', 'test goal'],
    ['goal', 'clear'],
    ['coordinator', ''],
    ['memory', 'TypeScript'],
  ];

  let passed = 0; let failed = 0;
  for (const [cmd, args] of tests) {
    const ok = await testCommand(cmd, args);
    if (ok) passed++; else failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
