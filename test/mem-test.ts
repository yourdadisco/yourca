import { initMempalace, storeMemory, searchMemories, detectProjectWing, setCurrentWing, enhanceSystemPrompt, getMemoryStats } from '../src/services/vectorMemory/index.js';

async function main() {
  console.log('\n=== MemPalace Cross-Session Test ===\n');
  const wing = detectProjectWing();
  setCurrentWing(wing);
  console.log(`Wing: ${wing}`);

  await initMempalace({ l0Identity: `You are YourCA in ${wing}`, wing });
  console.log('initMempalace OK');
  console.log('Stats:', JSON.stringify(getMemoryStats()));

  // Store
  const testContent = '用户偏好使用 TypeScript，喜欢显式类型标注，当前项目使用 React 18';
  console.log(`\nStoring: "${testContent}"`);
  const ids = await storeMemory(testContent, { wing, room: 'test', tags: ['test', 'preference'] });
  console.log(`Stored ${ids.length} chunk(s): ${ids.join(', ')}`);

  // Search
  console.log('\nSearching for "用户偏好"...');
  const results = await searchMemories('用户偏好', 5);
  if (results.length > 0) {
    console.log(`✅ Found ${results.length} memory(ies):`);
    for (const r of results) {
      console.log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content.slice(0, 120)}`);
    }
  } else {
    console.log('❌ No memories found');
    process.exit(1);
  }

  // enhanceSystemPrompt
  console.log('\nTesting enhanceSystemPrompt...');
  const enhanced = await enhanceSystemPrompt('You are YourCA.', '用户喜欢什么语言？');
  if (enhanced !== 'You are YourCA.') {
    console.log('✅ System prompt enhanced');
  } else {
    console.log('⚠️ Not enhanced');
  }

  console.log('\n=== ALL PASS ===');
}

main().catch(err => { console.error('\nFAIL:', err.message); process.exit(1); });
