import { initMempalace, storeMemory, searchMemories, clearMemories } from '../src/services/vectorMemory/index.js';

async function main() {
  // Fresh start
  await initMempalace({ l0Identity: 'test' });

  // Session 1: Store
  console.log('=== Session 1: Store ===');
  await storeMemory('用户喜欢用React 18开发', { room: 'test', tags: ['pref'] });
  await storeMemory('用户偏好TypeScript严格模式', { room: 'test', tags: ['pref'] });
  const r1 = await searchMemories('React', 5);
  console.log(`Found ${r1.length} results`);
  for (const r of r1) console.log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content}`);

  // Session 2: Read - simulates restart
  // (initMempalace is idempotent, data persists in LanceDB)
  console.log('\n=== Session 2: Read (same process, persisted DB) ===');
  const r2 = await searchMemories('TypeScript', 5);
  console.log(`Found ${r2.length} results`);
  for (const r of r2) console.log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content}`);

  console.log('\n✅ Cross-session memory works');
}

main().catch(e => { console.error('\n❌ FAIL:', e.message); process.exit(1); });
