# Agent Architecture Benchmark

## Usage

```bash
# 需要 API 密钥
export DEEPSEEK_API_KEY=sk-xxx

# 跑所有模式 + 所有任务（3 × 5 = 15 组测试）
npx tsx test/agent-tests/runner.ts

# 跑单模式
npx tsx test/agent-tests/runner.ts --mode normal

# 跑单任务
npx tsx test/agent-tests/runner.ts --task file-search
```

## 测试哪些模式

| Mode | Env Var | 行为 |
|---|---|---|
| `normal` | 无 | 默认模式，AgentTool 始终可用 |
| `coordinator` | `YOURCA_COORDINATOR_MODE=1` | 注入 coordinator system prompt |
| `delm` | `YOURCA_DELM_MODE=1` | 去中心化 gist 协作 |

## 测试哪些任务

| ID | Name | Type | Prompt |
|---|---|---|---|
| file-search | 文件搜索 | research | 找到所有包含 "export" 的 TS 文件 |
| code-mod | 代码修改 | implementation | 给 permissions.ts 加测试用例 |
| multi-step | 多步调研 | research | 分析工具系统架构方案 |
| bug-fix | Bug 修复 | implementation | 找 self-test.ts 的 off-by-one 错误 |
| qa | 知识问答 | knowledge | 解释 compact 系统分层工作方式 |

## 输出

- 终端打印对比表（token、耗时、tool 调用次数）
- 结果保存到 `test/agent-tests/results/YYYY-MM-DD-all.json`
