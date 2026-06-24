# Task 2 Report: Subagent Engine with Real Tool Execution

## What was done

Completely rewrote `src/services/subagent.ts` to fix the critical flaw where sub-agent tool calls returned fake results instead of executing real tools.

### Key changes

- **Renamed `spawnSubagent` to `runSubagent`** with a cleaner interface: takes a single `prompt` string instead of `systemPrompt + messages`, supports `agentType` for agent-driven tool filtering.
- **Real tool execution**: Instead of returning `[Subagent: toolName called with ...]` stubs, the subagent now calls `tool.call(input, parentContext)` for each tool invocation and pushes the real results back into the message loop.
- **Agent-aware tool filtering**: Uses `findAgent()` to look up the agent definition and applies `disallowedTools` and `tools` allowlists before sending tools to the API.
- **Token tracking across turns**: `totalInput`/`totalOutput` accumulate across all turns in the subagent loop.
- **toolCallCount**: Tracks how many tool calls were made during the subagent's lifetime.
- **Error handling**: Unknown tools get an error tool_result; tool execution errors are caught and returned as error tool_results.

### Interface changes

```typescript
// Old
export async function spawnSubagent(config: SubagentConfig): Promise<SubagentResult>
// SubagentConfig: { systemPrompt, messages?, tools, parentContext, maxTurns?, onText?, label? }
// SubagentResult: { messages, text, success, error?, usage }

// New
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult>
// SubagentConfig: { prompt, agentType?, tools, parentContext, maxTurns? }
// SubagentResult: { text, success, error?, usage, toolCallCount }
```

### Removed exports

- `getActiveSubagentCount()`, `stopSubagent()`, `stopAllSubagents()` — no longer needed; subagent lifecycle is managed by abort signal propagation from the parent context.

### Adjusted `getSystemPrompt` call

The agent definition's `getSystemPrompt()` requires a `{ toolUseContext }` parameter. Passed `config.parentContext.options` to satisfy the type signature.

## Verification

- `npx tsc --noEmit` — zero errors
- `npx tsx test/self-test.ts` — 16 passed, 0 failed
- Commit: `9b4b18f` with message `feat: rewrite subagent engine with real tool execution`
