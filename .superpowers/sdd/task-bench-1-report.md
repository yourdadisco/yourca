# Task Bench 1 — Benchmark Task Definitions

## Summary

Created `test/agent-tests/tasks.ts` with the `TestTask` interface and 5 benchmark task definitions covering research, implementation, and knowledge categories.

## Verification

- `npx tsc --noEmit` — zero errors
- `npx tsx test/self-test.ts` — 16 passed, 0 failed

## Commit

```
e2bb2b8 feat: add benchmark task definitions
 1 file changed, 39 insertions(+)
 create mode 100644 test/agent-tests/tasks.ts
```

## Tasks Defined

| ID | Name | Type |
|---|---|---|
| file-search | 文件搜索 | research |
| code-mod | 代码修改 | implementation |
| multi-step | 多步调研 | research |
| bug-fix | Bug 修复 | implementation |
| qa | 知识问答 | knowledge |
