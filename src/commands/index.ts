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
  description: 'Compact the conversation to save context',
  async action(_args, context) {
    const msgs = context.getMessages();
    if (msgs.length <= 2) {
      console.log('\nConversation is already short — nothing to compact.');
      return;
    }
    // Create summary
    const summary = `[Conversation compacted. ${msgs.length} messages were summarized to save context space. The original conversation content is summarized above. Please continue with the task.]`;
    const lastMsg = msgs[msgs.length - 1];
    context.setMessages([
      { role: 'user', content: [{ type: 'text', text: summary }] },
      lastMsg,
    ]);
    console.log(`\nCompacted ${msgs.length - 1} messages into summary.`);
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
