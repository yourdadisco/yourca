# Task 1 Report: Rewrite vectorMemory/index.ts

**Status:** DONE

**Commit:** `063a264` feat: rewrite vectorMemory as proper @mempalace/core integration

**Test Results:**
```
YourCA Self-Test Suite
  ✓ state: generateId format
  ✓ store: create, get, set, subscribe
  ✓ messages: createUserMessage
  ✓ messages: countTotalTokens
  ✓ tools: getAllTools has all core tools
  ✓ tools: getEnabledTools returns all
  ✓ tools: toolToApiDefinition format
  ✓ tools: findToolByName
  ✓ tools: correct isReadOnly/isDestructive flags
  ✓ tools: Edit tool schema validation
  ✓ commands: getAllCommands
  ✓ commands: findCommand by name and alias
  ✓ commands: slash detection and parsing
  ✓ context: basic system prompt structure
  ✓ context: includes CLAUDE.md content
  ✓ context: includes git branch and state

  Results: 16 passed, 0 failed
```

**TypeScript:** `npx tsc --noEmit` -- zero errors.

**Changes made:**
- Removed unnecessary re-exports of `@mempalace/core` internals (VectorStorage, MemoryStack, etc.) -- consumers import directly from `@mempalace/core`
- Removed unused exports: `addEntity`, `addTriple`, `queryEntity`, `kgStats`, `mineProject`, `searchByKeyword`, `searchBySemantic`
- Changed `detectEntities` import from static top-level to dynamic `await import('@mempalace/core')` in `storeMemory` for lazy loading of heavy NLP dependencies (as specified in the task brief)
- Cleaned up singleton lazy-init pattern to avoid circular import issues with `getStorage`/`getStack`/`getKG` helper duplication
- Preserved all externally-consumed exports: `Drawer` (type), `SearchHit` (type), `initMempalace`, `isReady`, `wakeUp`, `recall`, `deepSearch`, `storeMemory`, `searchMemories`, `buildRagContext`, `enhanceSystemPrompt`, `getMemoryStats`, `clearMemories`

**Concerns:** None.
