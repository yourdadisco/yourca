# Task 3: AgentTool — Report

## Objective
Create the `AgentTool` that spawns sub-agents, register it in the tool registry, and wire it up so the QueryEngine makes tools available via `getAppState`.

## Changes Made

### 1. Created `src/tool/built-in/AgentTool.ts`
- New tool using `buildTool()` with name `Agent`
- Accepts `prompt` (required) and `subagent_type` (optional enum: `general-purpose`, `explore`, `verify`)
- Calls `runSubagent` from `src/services/subagent.ts` with the prompt, agent type, parent context, and tools from `context.getAppState().tools`
- Returns structured XML in `<task-notification>` format with status, result (CDATA-wrapped), token usage, and tool call count
- Error case returns `<status>error</status>` with the error message

### 2. Updated `src/tool/tools.ts`
- Added import: `import { AgentTool } from './built-in/AgentTool.js';`
- Registered `AgentTool` in the `ALL_BASE_TOOLS` array

### 3. Updated `src/query/QueryEngine.ts`
- Changed `getAppState: () => ({})` to `getAppState: () => ({ tools })` so the AgentTool can access the available tools list

## Verification
- `npx tsc --noEmit` — zero errors
- `npx tsx test/self-test.ts` — 16 passed, 0 failed
- Commit: `b765469 feat: add AgentTool for spawning sub-agents`
