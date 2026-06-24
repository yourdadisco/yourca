# YourCA — Your Coding Assistant

A CLI AI programming assistant rebuilt from the architecture of Claude Code, enhanced with **layered context compression**, **dual-track memory** (MEMDIR + MemPalace), and **composite multi-agent architecture** (Coordinator + DeLM).

> **Origin:** Inspired by Claude Code's leaked TypeScript source (~150K LOC).  
> **Evolution:** Simplified core (~2K LOC) + three advanced subsystems (Phases 1-3).

---

## Quick Start

```bash
# Install
cd yourca
npm install

# Configure API key
# Create .env file with DEEPSEEK_API_KEY=sk-...
# Or set environment variable

# Start interactive REPL
npx tsx src/index.ts

# Single query
npx tsx src/index.ts "explain the architecture"

# Pipe from stdin
echo "list all TypeScript files" | npx tsx src/index.ts -
```

---

## Architecture

```
src/
├── index.ts                     # Entry point (REPL, single-query, stdin)
│
├── state/                       # State management
│   ├── bootstrap.ts             # Global session state (cost, tokens, model)
│   └── store.ts                 # Generic pub/sub reactive store
│
├── types/index.ts               # Centralized type definitions
│
├── tool/                        # Tool system
│   ├── Tool.ts                  # Base tool types & interfaces
│   ├── tools.ts                 # Tool registry & API serialization
│   ├── permissions.ts           # Permission engine (allow/deny/ask)
│   └── built-in/                # Tool implementations
│       ├── BashTool.ts          # Shell command execution
│       ├── FileReadTool.ts      # File content reading
│       ├── FileWriteTool.ts     # File creation
│       ├── FileEditTool.ts      # Surgical string-based editing
│       ├── GlobTool.ts          # File pattern matching
│       ├── GrepTool.ts          # Content search
│       ├── WebSearchTool.ts     # Web search (DuckDuckGo)
│       ├── WebFetchTool.ts      # URL content fetching
│       └── WebBrowserTool.ts    # Browser-like content extraction
│
├── query/                       # LLM interaction
│   ├── api.ts                   # DeepSeek streaming API (OpenAI-compatible)
│   ├── QueryEngine.ts           # Core agent loop (tool execution, compact, retry)
│   └── messages.ts              # Message builder helpers
│
├── context/context.ts           # System prompt builder (git, CLAUDE.md, date)
│
├── commands/index.ts            # Slash command registry
│   ├── /help, /clear, /cost     # Standard commands
│   ├── /model, /status          # Session management
│   ├── /compact                 # Manual compaction
│   ├── /memory                  # Memory stats & search
│   └── /goal                    # Loop engineering mode
│
├── repl/                        # UI layer
│   ├── REPL.ts                  # Interactive readline loop
│   ├── singleQuery.ts           # Non-interactive mode
│   └── state.ts                 # REPL message state
│
├── ui/                          # React-Ink UI (alternative to readline)
│   ├── app.tsx                  # Root app with ThemeProvider
│   ├── theme.tsx                # Theme system (dark/light)
│   ├── repl-screen.tsx          # Ink-based REPL screen
│   └── components/              # UI components (markdown, spinner, etc.)
│
├── coordinator/                 # ★ Multi-Agent System
│   ├── index.ts                 # Mode selection (coordinator | delm | hybrid)
│   ├── coordinatorMode.ts       # Centralized orchestration (Claude Code style)
│   └── delmMode.ts              # Decentralized mode (Stanford DeLM, 2026)
│       ├── Shared Gist Store    # Verified facts, partial results, failures
│       ├── Task Queue           # Autonomous task claiming
│       └── Agent Registry       # Capability advertisement & discovery
│
├── services/
│   ├── compact/                 # ★ Layered Context Compression
│   │   ├── index.ts             # Unified API
│   │   ├── types.ts             # Configuration types
│   │   ├── grouping.ts          # Message grouping by API round
│   │   ├── microCompact.ts      # L1: Rule-based tool result stripping (zero LLM)
│   │   ├── sessionMemory.ts     # L2: Background extraction + compact reuse (zero API)
│   │   ├── classicCompact.ts    # L3: LLM summarization with structured prompt
│   │   ├── reactiveCompact.ts   # L4: Emergency PTL handling
│   │   ├── autoCompact.ts       # Coordination: when & which layer to trigger
│   │   └── prompt.ts            # Summarization prompt templates
│   │
│   ├── vectorMemory/            # ★ MemPalace-inspired Vector Store
│   │   └── index.ts             # JSON-backed + BM25 keyword search
│   │
│   ├── goalEngine.ts            # ★ Loop Engineering (/goal mode)
│   ├── subagent.ts              # Sub-agent spawning & lifecycle
│   ├── errors.ts                # Error classification & retry
│   ├── history.ts               # JSONL conversation history
│   └── signals.ts               # SIGINT/SIGTERM handling
│
├── memory/index.ts              # ★ Dual-Track Memory System
│   │   MEMDIR (file-based) + Vector Memory (searchable)
│   ├── saveMemory()             # Write to BOTH systems
│   ├── searchAllMemories()      # Hybrid search (keyword + vector)
│   ├── savePreCompactContext()  # Pre-compact auto-save
│   └── buildMemoryPrompt()      # Unified memory context prompt
│
├── skills/index.ts              # Skill system (slash command skills)
├── plugins/index.ts             # Plugin system
├── schemas/index.ts             # JSON Schema validation
├── styles/index.ts              # Output style system
├── tasks/index.ts               # Background task management
├── keybindings/index.ts         # Key binding system
├── vim/index.ts                 # Vim mode state machine
├── bridge/index.ts              # Session ID compatibility
├── entrypoints/index.ts         # Entrypoint registry
└── utils/config.ts              # Configuration manager
```

---

## ★ Three Core Subsystems

### 1. Layered Context Compression

Four-layer progressive compaction architecture, ported from Claude Code:

```
Every Turn ──→ L1: MicroCompact (zero LLM)
                   ↓ tool results stripped
               L2: SessionMemory (zero API cost at compact time)
                   ↓ background extracted memory reused
               L3: ClassicCompact (LLM summarization)
                   ↓ structured 9-section summary
               L4: ReactiveCompact (PTL emergency)
                   ↓ aggressive trim + retry
```

| Layer | Cost | Info Loss | When |
|---|---|---|---|
| L1 Micro | $0 | Low | Every turn |
| L2 Session Memory | $0* | Medium | Context near limit |
| L3 Classic | ~20K out tokens | High | L2 unavailable |
| L4 Reactive | Varies | Highest | API 413 error |

*L2 extraction costs tokens incrementally during the session, but the compact step itself is zero. The file is reused across multiple compactions.

### 2. Dual-Track Memory System

| Aspect | MEMDIR (Claude native) | Vector Memory (MemPalace inspired) |
|---|---|---|
| Storage | Markdown files + MEMORY.md | JSON file + BM25 index |
| Prompt Cost | ~25KB always loaded | On-demand search results |
| Readable | ✅ Human-editable | ❌ Opaque |
| Search | Grep (unindexed) | BM25 keyword scoring |
| Retention | Short/medium-term | Long-term, auto-trimmed |
| Use Case | Active context, user edits | Historical recall |

All writes go to BOTH systems automatically. Search runs hybrid (keyword + MEMDIR grep).

### 3. Composite Multi-Agent Architecture

Supports three coordination strategies, switchable at runtime:

```
┌──────────┬──────────────┬──────────────┐
│  Aspect  │  Coordinator │    DeLM      │
├──────────┼──────────────┼──────────────┤
│ Control  │ Centralized  │ Decentralized│
│ Comm     │ Via coord.   │ Shared Gist  │
│ Tasks    │ Assign       │ Self-claim   │
│ Cost     │ Higher       │ ~50% lower   │
│ Best for │ Code changes │ Exploration  │
└──────────┴──────────────┴──────────────┘
```

**DeLM Mode** (Stanford 2026):
- `publishToGist()` — broadcast verified facts & failures
- `claimNextTask()` — autonomous task claiming
- `registerAgent()` — capability advertisement
- `broadcastVerification()` — cross-validated results

---

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation |
| `/cost` | Show session cost & tokens |
| `/model` | Show/change current model |
| `/status` | Show session info & context stats |
| `/compact [instructions]` | Manual compaction (layered) |
| `/memory [query]` | Memory stats (no arg) or search |
| `/goal <objective>` | Set session goal for loop engineering |
| `/goal clear` | Finish current goal |
| `/skills` | List all available commands |
| `/exit` | Quit yourca |

---

## Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | Yes | — | DeepSeek API key |
| `YOURCA_API_KEY` | Yes* | — | Alternative to DEEPSEEK_API_KEY |
| `YOURCA_MODEL` | No | `deepseek-chat` | Model override |
| `YOURCA_DISABLE_AUTO_MEMORY` | No | — | Set to `1` to disable auto memory |

---

## Running Tests

```bash
# Unit tests (no API key needed)
npx tsx test/self-test.ts

# Build
npm run build

# Run compiled version
node dist/index.js --help
```

---

## Key Design Decisions

- **Readline as default UI** — Faster startup, zero UI deps, simpler debugging than React-Ink
- **Layered over monolithic** — Each compact layer is independent, testable, and replaceable
- **Dual-track memory** — MEMDIR for human-readable edits, vector store for search
- **Pluggable coordination** — Switch strategies per task without restarting
- **File-based state** — No external databases required; everything lives in `.yourca/` directory
- **Streaming-first** — All API calls stream; UI receives real-time token-by-token updates

---

## Architecture References

- **Compact System** → Claude Code's `services/compact/` (4-layer progressive compression)
- **MEMDIR** → Claude Code's `memdir/` (file-based semantic memory)
- **Session Memory** → Claude Code's `services/SessionMemory/` (background extraction)
- **DeLM** → Stanford DeLM (2026): Decentralized coordination via shared gist
- **Coordinator** → Claude Code's `coordinator/coordinatorMode.ts`
- **Vector Memory** → MemPalace philosophy: verbatim storage + semantic search

---

## License

MIT
