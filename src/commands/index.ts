/**
 * Command registry — inspired by Claude Code's commands.ts
 */
import type { Tool, ToolUseContext, Message } from '../tool/Tool.js';

export interface Command {
  type: 'prompt' | 'action' | 'local';
  name: string;
  aliases?: string[];
  description: string;
  hidden?: boolean;
  /** For prompt-type commands: return the prompt to inject */
  getPrompt?: (args: string, context: CommandContext) => Promise<string | undefined>;
  /** For action-type commands: execute synchronously */
  action?: (args: string, context: CommandContext) => Promise<void>;
}

export interface CommandContext {
  tools: readonly Tool[];
  toolUseContext: ToolUseContext;
  getMessages: () => Message[];
  setMessages: (msgs: Message[]) => void;
  systemPrompt: string;
  abortController: AbortController;
  requestUserInput: (prompt: string) => Promise<string>;
}

// ---- Built-in command implementations ----

const clearCommand: Command = {
  type: 'action',
  name: 'clear',
  description: 'Clear the conversation and start fresh',
  async action() {
    // Handled in REPL
  },
};

const exitCommand: Command = {
  type: 'action',
  name: 'exit',
  aliases: ['quit'],
  description: 'Exit yourca',
  async action() {
    process.exit(0);
  },
};

const costCommand: Command = {
  type: 'action',
  name: 'cost',
  description: 'Show session cost and usage',
  async action() {
    const { getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens, getTotalAPIDuration } = await import('../state/bootstrap.js');
    console.log(`\n📊 Session Summary`);
    console.log(`   Total cost:      $${getTotalCostUSD().toFixed(4)}`);
    console.log(`   Input tokens:    ${getTotalInputTokens().toLocaleString()}`);
    console.log(`   Output tokens:   ${getTotalOutputTokens().toLocaleString()}`);
    console.log(`   API duration:    ${(getTotalAPIDuration() / 1000).toFixed(1)}s`);
  },
};

const helpCommand: Command = {
  type: 'action',
  name: 'help',
  aliases: ['?'],
  description: 'Show available commands',
  async action(_args, context) {
    const commands = getAllCommands();
    console.log('\n📋 Available commands:');
    for (const cmd of commands) {
      if (cmd.hidden) continue;
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
      console.log(`   /${cmd.name}${aliases}  — ${cmd.description}`);
    }
    console.log('');
  },
};

const modelCommand: Command = {
  type: 'action',
  name: 'model',
  description: 'Show or change the current model',
  async action(args) {
    const { getMainLoopModel, setMainLoopModel } = await import('../state/bootstrap.js');
    if (args.trim()) {
      setMainLoopModel(args.trim());
      console.log(`\nModel set to: ${args.trim()}`);
    } else {
      console.log(`\nCurrent model: ${getMainLoopModel()}`);
    }
  },
};

const statusCommand: Command = {
  type: 'action',
  name: 'status',
  description: 'Show session status',
  async action() {
    const { getSessionId, getTurnCount, getMainLoopModel } = await import('../state/bootstrap.js');
    console.log(`\nℹ️  Session: ${getSessionId()}`);
    console.log(`   Model:   ${getMainLoopModel()}`);
    console.log(`   Turns:   ${getTurnCount()}`);
    console.log(`   CWD:     ${process.cwd()}`);
  },
};

const compactCommand: Command = {
  type: 'action',
  name: 'compact',
  description: 'Compact the conversation to save context (layered: micro → memory → LLM)',
  async action(args, context) {
    const msgs = context.getMessages();
    if (msgs.length <= 2) {
      console.log('\nConversation is already short — nothing to compact.');
      return;
    }

    const customInstructions = args.trim() || undefined;

    // First: save pre-compact context to vector memory
    const { savePreCompactContext } = await import('../memory/index.js');
    const textMessages = msgs.map(m => ({
      role: m.role,
      content: m.content.filter(c => c.type === 'text').map(c => c.text).join('\n'),
    }));
    savePreCompactContext(textMessages);
    console.log('   ✓ Pre-compact context saved to vector memory');

    // Try session memory compact first (L2, zero API)
    const { getSessionMemoryContent, isSessionMemoryEmpty, buildSessionMemorySummaryMessage } =
      await import('../services/compact/index.js');

    const sessionMemory = getSessionMemoryContent();
    let compactMsgs: Message[] = [];

    if (!isSessionMemoryEmpty()) {
      const summaryText = buildSessionMemorySummaryMessage(sessionMemory, Math.min(5, Math.floor(msgs.length * 0.1)));
      const summaryMsg: Message = { role: 'user', content: [{ type: 'text', text: summaryText }] };
      compactMsgs = [
        summaryMsg,
        ...msgs.slice(-Math.min(5, Math.max(2, Math.floor(msgs.length * 0.1)))),
      ];
      console.log(`\n✓ Compacted via session memory (zero API cost)`);
    } else {
      // Fallback: keep last 5 messages, create compact summary
      const keepCount = Math.min(5, msgs.length - 1);
      const preserved: Message[] = msgs.slice(-keepCount);
      const toCompact = msgs.slice(0, -keepCount);

      const summary = `[Conversation compacted. ${toCompact.length} messages were summarized. The previous conversation covered the current task. Continue with the task. ${customInstructions ? `Focus: ${customInstructions}` : ''}]`;

      const compactMsg: Message = { role: 'user', content: [{ type: 'text', text: summary }] };
      compactMsgs = [compactMsg, ...preserved];
      console.log(`\n✓ Compacted ${toCompact.length} messages, preserved ${keepCount}.`);
    }

    context.setMessages(compactMsgs);
  },
};

const skillsCommand: Command = {
  type: 'action',
  name: 'skills',
  description: 'List available slash commands',
  async action(_args, context) {
    console.log('\n🔧 Available slash commands:');
    for (const cmd of getAllCommands()) {
      if (cmd.hidden) continue;
      console.log(`   /${cmd.name}  — ${cmd.description}`);
    }
    console.log('');
  },
};

const memoryCommand: Command = {
  type: 'action',
  name: 'memory',
  description: 'Show memory stats and search memories',
  hidden: false,
  async action(args) {
    const { getMemoryStats, searchAllMemories } = await import('../memory/index.js');
    const { getMemoryCount } = await import('../services/vectorMemory/index.js');

    if (args.trim()) {
      // Search
      const results = searchAllMemories(args.trim(), 10);
      console.log(`\n🔍 Search results for: "${args.trim()}"`);
      console.log(`   Vector memory: ${results.vectorResults.length} results`);
      for (const r of results.vectorResults) {
        const age = Math.floor((Date.now() - r.entry.timestamp) / 86400000);
        console.log(`   [${r.matchType}] ${Math.round(r.score * 100)}% match, ${age}d ago`);
        console.log(`       ${r.entry.content.slice(0, 120)}...`);
      }
      console.log(`   File memory: ${results.memdirResults.length} results`);
      for (const r of results.memdirResults) {
        console.log(`   ${r}`);
      }
    } else {
      // Stats
      const stats = getMemoryStats();
      console.log(`\n🧠 Memory System`);
      console.log(`   File memories (MEMDIR): ${stats.memdirFileCount} files, ~${stats.totalEstimatedTokens} tokens`);
      console.log(`   Vector entries:          ${getMemoryCount()}`);
      console.log(`   Use /memory <query> to search`);
    }
  },
};

const goalCommand: Command = {
  type: 'action',
  name: 'goal',
  description: 'Set a session goal for loop engineering',
  hidden: false,
  async action(args) {
    const { setGoalMode, isGoalModeActive, getGoalState } = await import('../services/goalEngine.js');
    if (!args.trim()) {
      if (isGoalModeActive()) {
        const state = getGoalState();
        if (!state) {
          console.log('\n🎯 No active goal.');
          return;
        }
        console.log(`\n🎯 Active Goal:`);
        console.log(`   ${state.goal}`);
        console.log(`   Status: ${state.status}`);
        console.log(`   Iterations: ${state.iteration}`);
        console.log(`   Use /goal clear to finish`);
      } else {
        console.log('\n🎯 No active goal. Use /goal <your objective> to set one.');
        console.log('   The goal system helps you iterate toward a target.');
        console.log('   Examples:');
        console.log('     /goal Refactor auth module to use JWT');
        console.log('     /goal Fix all TypeScript errors in src/');
        console.log('     /goal clear  — finish current goal');
      }
      return;
    }

    if (args.trim() === 'clear') {
      const { clearGoal } = await import('../services/goalEngine.js');
      clearGoal();
      console.log('\n🎯 Goal cleared.');
      return;
    }

    setGoalMode(args.trim());
    console.log(`\n🎯 Goal set: ${args.trim()}`);
    console.log(`   Starting loop engineering. Use /status to check progress.`);
    console.log(`   Use /goal clear to finish.`);
  },
};

const VERSION = '0.1.0';

const versionCommand: Command = {
  type: 'action',
  name: 'version',
  aliases: ['-v', '--version'],
  description: 'Show version',
  hidden: true,
  async action() {
    console.log(`${VERSION} (yourca)`);
  },
};

// ---- Command registry ----

const builtinCommands: Command[] = [
  clearCommand,
  exitCommand,
  costCommand,
  helpCommand,
  modelCommand,
  statusCommand,
  compactCommand,
  skillsCommand,
  versionCommand,
  memoryCommand,
  goalCommand,
];

export function getAllCommands(): Command[] {
  return builtinCommands;
}

export function findCommand(name: string): Command | undefined {
  return builtinCommands.find(
    (c) => c.name === name || c.aliases?.includes(name),
  );
}

export function isSlashCommand(text: string): boolean {
  return text.startsWith('/');
}

export function parseSlashCommand(text: string): { command: string; args: string } | null {
  if (!text.startsWith('/')) return null;
  const parts = text.slice(1).split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1).join(' ');
  return { command, args };
}
