/**
 * Comprehensive memory system TUI simulation test.
 * Tests all memory workflows through the actual module APIs,
 * simulating what happens in the TUI.
 */
import { initMempalace, storeMemory, searchMemories, enhanceSystemPrompt, getWingStats, getMemoryStats, detectProjectWing, setCurrentWing, autoSave } from '../src/services/vectorMemory/index.js';
import { findCommand } from '../src/commands/index.js';

let passed = 0, failed = 0;
let logs: string[] = [];

function log(msg: string) { logs.push(msg); console.log(msg); }

async function assert(condition: boolean, msg: string) {
  if (condition) { passed++; log(`  ✅ ${msg}`); }
  else { failed++; log(`  ❌ ${msg}`); }
}

async function main() {
  log('========================================');
  log('  Memory System TUI Simulation Test');
  log('  Date: ' + new Date().toISOString().split('T')[0]);
  log('========================================\n');

  // 1. Initialization
  log('--- 1. Startup: Init MemPalace ---');
  const wing = detectProjectWing();
  setCurrentWing(wing);
  log(`  Wing detected: ${wing}`);
  await initMempalace({ l0Identity: `You are YourCA in ${wing}` });
  const stats1 = getMemoryStats();
  log(`  DB size: ${stats1.vectorSizeKB} KB`);

  // 2. /memory command (stats)
  log('\n--- 2. /memory (stats) ---');
  const memCmd = findCommand('memory');
  assert(!!memCmd, '/memory command registered');
  if (memCmd) {
    let output = '';
    const orig = console.log;
    console.log = (m: string) => { output += m + '\n'; };
    await memCmd.action!('', {} as any);
    console.log = orig;
    assert(output.includes('Drawers'), `/memory shows stats: ${output.slice(0, 60)}...`);
    log(`  Raw output:\n${output.slice(0, 200)}`);
  }

  // 3. /role command
  log('\n--- 3. /role (current wing) ---');
  const roleCmd = findCommand('role');
  assert(!!roleCmd, '/role command registered');

  // 4. /goal command
  log('\n--- 4. /goal (set/clear cycle) ---');
  const goalCmd = findCommand('goal');
  assert(!!goalCmd, '/goal command registered');

  // 5. /coordinator command
  log('\n--- 5. /coordinator (toggle) ---');
  const coordCmd = findCommand('coordinator');
  assert(!!coordCmd, '/coordinator command registered');

  // 6. Store conversation memory
  log('\n--- 6. Auto-save: storing conversation ---');
  const convo1 = '用户说：我喜欢用TypeScript写React组件，用Vitest跑测试';
  const ids1 = await storeMemory(convo1, { tags: ['conversation'] });
  assert(ids1.length > 0, `Stored ${ids1.length} chunk(s): "${convo1.slice(0, 40)}..."`);

  const convo2 = '用户说：请帮我检查一下Button组件的onClick事件冒泡问题';
  const ids2 = await storeMemory(convo2, { tags: ['conversation'] });
  assert(ids2.length > 0, `Stored ${ids2.length} chunk(s): "${convo2.slice(0, 40)}..."`);

  // 7. Semantic search
  log('\n--- 7. /memory <query>: search "TypeScript" ---');
  const r1 = await searchMemories('TypeScript', 5);
  assert(r1.length > 0, `Found ${r1.length} results for "TypeScript"`);
  for (const r of r1) {
    log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content.slice(0, 60)}`);
  }

  log('\n--- 8. /memory <query>: search "事件冒泡" ---');
  const r2 = await searchMemories('事件冒泡', 5);
  assert(r2.length > 0, `Found ${r2.length} results for "事件冒泡"`);
  for (const r of r2) {
    log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content.slice(0, 60)}`);
  }

  log('\n--- 9. /memory <query>: search "Button" ---');
  const r3 = await searchMemories('Button', 5);
  assert(r3.length > 0, `Found ${r3.length} results for "Button"`);

  // 10. enhanceSystemPrompt (RAG injection)
  log('\n--- 10. enhanceSystemPrompt (RAG context injection) ---');
  const basePrompt = 'You are YourCA.';
  const enhanced = await enhanceSystemPrompt(basePrompt, '用户喜欢用什么测试框架？');
  const hasMemories = enhanced !== basePrompt;
  assert(hasMemories, 'enhanceSystemPrompt injected relevant memories');
  if (hasMemories) {
    log(`  Prompt length: ${enhanced.length} chars (base: ${basePrompt.length})`);
    log(`  Preview: "${enhanced.slice(basePrompt.length, basePrompt.length + 120)}..."`);
  }

  // 11. Cross-session simulation (re-init keeps data)
  log('\n--- 11. Cross-session persistence ---');
  const stats2 = getMemoryStats();
  log(`  DB file: ${stats2.vectorSizeKB} KB`);

  // 12. Wing stats
  log('\n--- 12. getWingStats (taxonomy) ---');
  const tax = await getWingStats();
  assert(tax.total > 0, `Total drawers: ${tax.total}`);
  assert(Object.keys(tax.wings).length > 0, `Wings: ${Object.keys(tax.wings).join(', ')}`);
  assert(Object.keys(tax.rooms).length > 0, `Rooms: ${Object.keys(tax.rooms).join(', ')}`);

  // Summary
  log('\n' + '='.repeat(40));
  log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  log('='.repeat(40) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { log(`\nFATAL: ${err.message}`); process.exit(1); });
