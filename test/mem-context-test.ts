/**
 * Tests that memories are actually loaded into context.
 * Stores a memory, then calls enhanceSystemPrompt to verify
 * the memory appears in the system prompt context.
 */
import { initMempalace, storeMemory, searchMemories, enhanceSystemPrompt, detectProjectWing, setCurrentWing } from '../src/services/vectorMemory/index.js';

async function main() {
  console.log('\n=== Memory Context Loading Test ===\n');

  const wing = detectProjectWing();
  setCurrentWing(wing);
  await initMempalace({ l0Identity: `You are YourCA.` });

  // Store a test memory
  await storeMemory('用户喜欢用Vitest写测试，偏好TypeScript严格模式', { tags: ['preference'] });

  // Simulate what happens in TUI: user asks a question
  const basePrompt = `You are YourCA, an AI assistant.

## Core capabilities
- Use the Read/Write/Edit tools for file operations
- Answer questions based on your knowledge and available context

## User question: 我之前告诉过你我喜欢用什么测试框架吗？`;

  const enhancedPrompt = await enhanceSystemPrompt(basePrompt, '我喜欢什么测试框架');

  // Check if the memory was injected
  const hasMemory = enhancedPrompt !== basePrompt;
  console.log(`Base prompt length: ${basePrompt.length}`);
  console.log(`Enhanced prompt length: ${enhancedPrompt.length}`);
  console.log(`Memory injected: ${hasMemory ? '✅ YES' : '❌ NO'}`);

  if (hasMemory) {
    // Extract the injected section
    const injection = enhancedPrompt.slice(basePrompt.length);
    console.log(`\nInjected context:\n${injection.slice(0, 300)}`);
  }

  // Also verify the conversation memory is relevant to the query
  console.log('\n--- Verification ---');
  const results = await searchMemories('测试框架 Vitest', 3);
  const foundRelevant = results.some(r => r.chunk.content.includes('Vitest'));
  console.log(`Searched for "测试框架 Vitest": ${foundRelevant ? '✅ FOUND' : '❌ NOT FOUND'}`);
  for (const r of results) {
    console.log(`  [${Math.round(r.score * 100)}%] ${r.chunk.content.slice(0, 80)}`);
  }

  console.log(`\n=== ${hasMemory && foundRelevant ? 'ALL PASS' : 'SOME FAILED'} ===`);
  process.exit(hasMemory && foundRelevant ? 0 : 1);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
