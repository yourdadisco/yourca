# YourCA — 你的编码助手

一款 CLI AI 编程助手，从 Claude Code 架构重建，并增强为 **分层上下文压缩**、**双轨记忆系统**（MEMDIR + MemPalace）和 **复合多 Agent 架构**（Coordinator + DeLM）。

> **起源：** 基于 Claude Code 泄露的 TypeScript 源码（~15 万行）。  
> **演进：** 精简核心（~2K LOC）+ 三大高级子系统（阶段 1-3）。

---

## 快速开始

```bash
# 安装
cd yourca
npm install

# 配置 API 密钥
# 创建 .env 文件，写入 DEEPSEEK_API_KEY=sk-...
# 或者设置环境变量

# 启动交互式 REPL
npx tsx src/index.ts

# 单次查询
npx tsx src/index.ts "解释这个项目的架构"

# 从标准输入读取
echo "列出所有 TypeScript 文件" | npx tsx src/index.ts -
```

---

## 架构

```
src/
├── index.ts                     # 入口点（REPL、单次查询、标准输入）
│
├── state/                       # 状态管理
│   ├── bootstrap.ts             # 全局会话状态（成本、token、模型）
│   └── store.ts                 # 通用发布/订阅响应式存储
│
├── types/index.ts               # 集中类型定义
│
├── tool/                        # 工具系统
│   ├── Tool.ts                  # 基础工具类型与接口
│   ├── tools.ts                 # 工具注册表与 API 序列化
│   ├── permissions.ts           # 权限引擎（允许/拒绝/询问）
│   └── built-in/                # 工具实现
│       ├── BashTool.ts          # Shell 命令执行
│       ├── FileReadTool.ts      # 文件内容读取
│       ├── FileWriteTool.ts     # 文件创建
│       ├── FileEditTool.ts      # 精确字符串编辑
│       ├── GlobTool.ts          # 文件模式匹配
│       ├── GrepTool.ts          # 内容搜索
│       ├── WebSearchTool.ts     # 网页搜索（DuckDuckGo）
│       ├── WebFetchTool.ts      # URL 内容获取
│       └── WebBrowserTool.ts    # 类浏览器内容提取
│
├── query/                       # LLM 交互
│   ├── api.ts                   # DeepSeek 流式 API（OpenAI 兼容）
│   ├── QueryEngine.ts           # 核心 Agent 循环（工具执行、压缩、重试）
│   └── messages.ts              # 消息构建辅助函数
│
├── context/context.ts           # 系统提示构建器（git、CLAUDE.md、日期）
│
├── commands/index.ts            # 斜杠命令注册表
│   ├── /help, /clear, /cost     # 标准命令
│   ├── /model, /status          # 会话管理
│   ├── /compact                 # 手动压缩
│   ├── /memory                  # 记忆统计与搜索
│   └── /goal                    # 循环工程模式
│
├── repl/                        # UI 层
│   ├── REPL.ts                  # 交互式 readline 循环
│   ├── singleQuery.ts           # 非交互模式
│   └── state.ts                 # REPL 消息状态
│
├── ui/                          # React-Ink UI（readline 的替代方案）
│   ├── app.tsx                  # 带 ThemeProvider 的根应用
│   ├── theme.tsx                # 主题系统（深色/浅色）
│   ├── repl-screen.tsx          # 基于 Ink 的 REPL 屏幕
│   └── components/              # UI 组件（markdown、spinner 等）
│
├── coordinator/                 # ★ 多 Agent 系统
│   ├── index.ts                 # 模式选择（coordinator | delm | hybrid）
│   ├── coordinatorMode.ts       # 集中式编排（Claude Code 风格）
│   └── delmMode.ts              # 去中心化模式（Stanford DeLM, 2026）
│       ├── 共享 Gist 存储       # 已验证事实、部分结果、失败记录
│       ├── 任务队列              # 自主认领任务
│       └── Agent 注册表         # 能力宣告与发现
│
├── services/
│   ├── compact/                 # ★ 分层上下文压缩
│   │   ├── index.ts             # 统一 API
│   │   ├── types.ts             # 配置类型
│   │   ├── grouping.ts          # 按 API round 分组消息
│   │   ├── microCompact.ts      # L1: 规则消除工具结果（零 LLM）
│   │   ├── sessionMemory.ts     # L2: 后台提取 + 压缩时复用（零 API）
│   │   ├── classicCompact.ts    # L3: LLM 结构化摘要
│   │   ├── reactiveCompact.ts   # L4: PTL 紧急处理
│   │   ├── autoCompact.ts       # 协调层：何时及用哪层触发
│   │   └── prompt.ts            # 总结提示模板
│   │
│   ├── vectorMemory/            # ★ MemPalace 风格向量存储
│   │   └── index.ts             # JSON 存储 + BM25 关键词搜索
│   │
│   ├── goalEngine.ts            # ★ 循环工程（/goal 模式）
│   ├── subagent.ts              # 子 Agent 生成与生命周期
│   ├── errors.ts                # 错误分类与重试
│   ├── history.ts               # JSONL 对话历史
│   └── signals.ts               # SIGINT/SIGTERM 处理
│
├── memory/index.ts              # ★ 双轨记忆系统
│   │   MEMDIR（文件化）+ 向量记忆（可搜索）
│   ├── saveMemory()             # 同时写入两套系统
│   ├── searchAllMemories()      # 混合搜索（关键词 + 向量）
│   ├── savePreCompactContext()  # 压缩前自动保存
│   └── buildMemoryPrompt()      # 统一记忆上下文提示
│
├── skills/index.ts              # 技能系统（斜杠命令技能）
├── plugins/index.ts             # 插件系统
├── schemas/index.ts             # JSON Schema 验证
├── styles/index.ts              # 输出样式系统
├── tasks/index.ts               # 后台任务管理
├── keybindings/index.ts         # 按键绑定系统
├── vim/index.ts                 # Vim 模式状态机
├── bridge/index.ts              # 会话 ID 兼容性
├── entrypoints/index.ts         # 入口点注册表
└── utils/config.ts              # 配置管理器
```

---

## ★ 三大核心子系统

### 1. 分层上下文压缩

四层递进压缩架构，移植自 Claude Code：

```
每轮 → L1: MicroCompact（零 LLM）
          ↓ 消除工具结果
      L2: SessionMemory（压缩时零 API 成本）
          ↓ 复用了后台提取的记忆
      L3: ClassicCompact（LLM 摘要）
          ↓ 结构化 9 段式总结
      L4: ReactiveCompact（PTL 紧急处理）
          ↓ 积极裁剪 + 重试
```

| 层级 | 成本 | 信息损失 | 触发时机 |
|---|---|---|---|
| L1 微压缩 | $0 | 低 | 每轮 |
| L2 会话记忆 | $0* | 中 | 上下文接近限制 |
| L3 经典压缩 | ~20K out tokens | 高 | L2 不可用 |
| L4 响应式压缩 | 不定 | 最高 | API 413 错误 |

*L2 提取在会话期间逐步消耗 token，但压缩步骤本身为零。文件可在多次压缩间复用。

### 2. 双轨记忆系统

| 维度 | MEMDIR（Claude 原生） | 向量记忆（MemPalace 启发） |
|---|---|---|
| 存储 | Markdown 文件 + MEMORY.md | JSON 文件 + BM25 索引 |
| 提示成本 | ~25KB 始终加载 | 按需搜索结果 |
| 可读性 | ✅ 人类可直接编辑 | ❌ 不透明 |
| 搜索 | Grep（无索引） | BM25 关键词评分 |
| 保留期 | 短期/中期 | 长期，自动裁剪 |
| 用途 | 活跃上下文、用户编辑 | 历史回忆 |

所有写入自动进入**两套系统**。搜索运行时混合（关键词 + MEMDIR grep）。

### 3. 复合多 Agent 架构

支持三种协调策略，可在运行时切换：

```
┌──────────┬──────────────┬──────────────┐
│   维度   │   Coordinator │    DeLM      │
├──────────┼──────────────┼──────────────┤
│ 控制     │ 集中式        │ 去中心化     │
│ 通信     │ 通过协调器     │ 共享 Gist    │
│ 任务     │ 分配          │ 自主认领     │
│ 成本     │ 较高          │ ~50% 更低    │
│ 擅长     │ 代码变更      │ 探索性任务   │
└──────────┴──────────────┴──────────────┘
```

**DeLM 模式**（Stanford 2026）：
- `publishToGist()` — 广播已验证事实与失败
- `claimNextTask()` — 自主认领任务
- `registerAgent()` — 能力宣告
- `broadcastVerification()` — 交叉验证结果

---

## 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示可用命令 |
| `/clear` | 清空对话 |
| `/cost` | 显示会话成本与 token |
| `/model` | 显示/切换当前模型 |
| `/status` | 显示会话信息与上下文统计 |
| `/compact [指令]` | 手动压缩（分层） |
| `/memory [查询]` | 记忆统计（无参数）或搜索 |
| `/goal <目标>` | 设置会话目标，启动循环工程 |
| `/goal clear` | 完成当前目标 |
| `/skills` | 列出所有可用命令 |
| `/exit` | 退出 yourca |

---

## 环境变量

| 变量 | 必需 | 默认 | 说明 |
|------|------|------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API 密钥 |
| `YOURCA_API_KEY` | 是* | — | DEEPSEEK_API_KEY 的替代 |
| `YOURCA_MODEL` | 否 | `deepseek-chat` | 模型覆盖 |
| `YOURCA_DISABLE_AUTO_MEMORY` | 否 | — | 设为 `1` 禁用自动记忆 |

---

## 运行测试

```bash
# 单元测试（无需 API 密钥）
npx tsx test/self-test.ts

# 构建
npm run build

# 运行编译版本
node dist/index.js --help
```

---

## 关键设计决策

- **Readline 作为默认 UI** — 启动更快，零 UI 依赖，比 React-Ink 更易调试
- **分层而非整体** — 每个压缩层独立、可测试、可替换
- **双轨记忆** — MEMDIR 用于人类可读编辑，向量存储用于搜索
- **可插拔协调** — 按任务切换策略，无需重启
- **基于文件的状态** — 无需外部数据库；所有数据位于 `.yourca/` 目录
- **流式优先** — 所有 API 调用流式输出；UI 实时接收逐 token 更新

---

## 架构参考

- **压缩系统** → Claude Code 的 `services/compact/`（4 层递进压缩）
- **MEMDIR** → Claude Code 的 `memdir/`（基于文件的语义记忆）
- **会话记忆** → Claude Code 的 `services/SessionMemory/`（后台提取）
- **DeLM** → Stanford DeLM（2026）：通过共享 gist 去中心化协调
- **Coordinator** → Claude Code 的 `coordinator/coordinatorMode.ts`
- **向量记忆** → MemPalace 理念：原文存储 + 语义搜索

---

## 开源协议

MIT
