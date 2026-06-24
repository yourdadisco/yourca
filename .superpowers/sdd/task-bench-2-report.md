# Task Bench 2 — Agent Benchmark Runner

## Summary

Created `test/agent-tests/runner.ts` — the benchmark execution harness that runs each benchmark task across three agent architectures (normal, coordinator, delm) and compares token usage, duration, and tool call counts.

## Implementation Details

- Orchestrates benchmark execution for all 5 tasks from `tasks.ts` across `normal`, `coordinator`, and `delm` modes
- Mode switching via environment variables (`YOURCA_COORDINATOR_MODE`, `YOURCA_DELM_MODE`) and `setArchitecture()` calls
- Supports `--mode` and `--task` CLI filters for selective runs
- Results saved as JSON files in `test/agent-tests/results/` with YYYY-MM-dd naming
- Prints a comparison table showing token usage and duration per mode per task
- Requires `DEEPSEEK_API_KEY` or `YOURCA_API_KEY` environment variable

## Verification

- `npx tsc --noEmit` — zero errors
- `npx tsx test/self-test.ts` — 16 passed, 0 failed

## Commit

```
8e681f9 feat: add agent benchmark runner
 1 file changed, 194 insertions(+)
 create mode 100644 test/agent-tests/runner.ts
```

## Files Created

| File | Purpose |
|---|---|
| `test/agent-tests/runner.ts` | Benchmark execution harness |
