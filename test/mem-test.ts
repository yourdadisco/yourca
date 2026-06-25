import { initMempalace, storeMemory, searchMemories, detectProjectWing, setCurrentWing, enhanceSystemPrompt, getMemoryStats } from '../src/services/vectorMemory/index.js';

async function main() {
  console.log('\n=== MemPalace Test ===\n');
  const wing = detectProjectWing();
  setCurrentWing(wing);
  console.log(`Wing: ${wing}`);

  await initMempalace({ l0Identity: 'You are YourCA.', wing });
  console.log(`Stats: ${JSON.stringify(getMemoryStats())}`);

  const text = '用户喜欢使用 TypeScript';
  console.log(`Storing: "${text}"`);
  const ids = await storeMemory(text, { wing, tags: ['test'] });
  console.log(`Stored ${ids.length} chunk(s)`);

  const results = await searchMemories('TypeScript', 5);
  if (results.length > 0) {
    console.log(`✅ Found ${results.length} memories`);
  } else {
    console.log('❌ No memories found');
    process.exit(1);
  }

  const enhanced = await enhanceSystemPrompt('Base prompt.', 'TypeScript');
  if (enhanced !== 'Base prompt.') {
    console.log('✅ enhanceSystemPrompt works');
  }

  console.log('\n=== ALL PASS ===');
}

main().catch(err => { console.error('\nFAIL:', err.message); process.exit(1); });
