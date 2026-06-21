# YourCA — Your Coding Assistant

A CLI AI programming assistant rebuilt from the architecture of Claude Code. YourCA provides an interactive terminal-based coding assistant with file operations, shell access, and code search capabilities.

> **Architecture:** Inspired by Claude Code's leaked source (typescript, ~150K LOC, React-Ink TUI).  
> **YourCA:** Simplified and streamlined (~2K LOC, Node.js readline, zero external UI deps).

## Quick Start

```bash
# Clone and install
cd yourca
npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start interactive REPL
npx tsx src/index.ts

# Or run a single query
npx tsx src/index.ts "explain the architecture of this project"

# Pipe from stdin
echo "list all TypeScript files" | npx tsx src/index.ts -
```

## Features

- **Interactive REPL** — Chat-like interface with streaming responses
- **File Operations** — Read, write, and edit files
- **Shell Access** — Execute commands via Bash tool
- **Code Search** — Glob and Grep for fast project exploration
- **Web Search** — Search the web and fetch URLs
- **Context Awareness** — Reads CLAUDE.md, git status, and branch info
- **Slash Commands** — `/help`, `/clear`, `/cost`, `/model`, `/status`, `/compact`, `/exit`
- **Cost Tracking** — Per-session token usage and cost display

## Built-in Tools

| Tool | Description |
|------|-------------|
| `Bash` | Execute shell commands |
| `Read` | Read file contents |
| `Write` | Create new files |
| `Edit` | Surgical file editing |
| `Glob` | File pattern matching |
| `Grep` | Content search |
| `WebSearch` | Web search |
| `WebFetch` | URL content fetch |

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation |
| `/cost` | Show session cost |
| `/model` | Show/change model |
| `/status` | Show session info |
| `/compact` | Compact conversation |
| `/exit` | Quit yourca |

## Architecture

```
src/
  index.ts             # Entry point (REPL, single-query, stdin)
  state/
    bootstrap.ts       # Global session state (singletons)
    store.ts           # Generic pub/sub store
  tool/
    Tool.ts            # Base tool types
    tools.ts           # Tool registry
    built-in/          # Tool implementations
  query/
    api.ts             # Anthropic SDK streaming client
    QueryEngine.ts     # Conversation loop (API + tool execution)
    messages.ts        # Message helpers
  context/
    context.ts         # System prompt builder (git, CLAUDE.md, date)
  commands/
    index.ts           # Slash command registry
  repl/
    REPL.ts            # Interactive readline loop
    singleQuery.ts     # Non-interactive mode
    state.ts           # REPL message state
```

### Key Design Decisions

- **Readline over React-Ink**: Faster startup, zero UI deps, simpler debugging
- **Non-generic Tools**: `Record<string, unknown>` inputs with explicit casts — simpler than complex generics
- **Split State**: Bootstrap (global, mutable) + Store (reactive, pub/sub)
- **Streaming API**: Full Anthropic SDK v0.32 streaming for real-time output

## Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `YOURCA_API_KEY` | Yes* | — | Alternative to ANTHROPIC_API_KEY |
| `YOURCA_MODEL` | No | `claude-sonnet-4-20250514` | Model override |

## Running Tests

```bash
# Unit tests (no API key needed)
npx tsx test/self-test.ts

# Build
npm run build

# Run compiled version
node dist/index.js --help
```

## License

MIT
