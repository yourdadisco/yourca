/**
 * Subagent system — ported from Claude Code's AgentTool / coordinator system.
 * Provides:
 * - Spawning sub-agents that can run their own query loops
 * - Isolated context per sub-agent (messages, tools, abort)
 * - Result collection from sub-agents
 * - Sub-agent lifecycle management
 */

import type { Tool, ToolUseContext, Message, Content, ToolResult } from '../tool/Tool.js';
import { streamChatCompletion } from '../query/api.js';
import { getMainLoopModel, addToTotalCostState, addToTotalDurationState, addTokenUsage, generateId } from '../state/bootstrap.js';

export interface SubagentConfig {
  /** System prompt for the subagent */
  systemPrompt: string;
  /** Initial messages to start with */
  messages?: Message[];
  /** Tools available to the subagent */
  tools: readonly Tool[];
  /** Parent context for abort propagation */
  parentContext: ToolUseContext;
  /** Max turns for the subagent loop */
  maxTurns?: number;
  /** Called for each streaming text chunk */
  onText?: (text: string) => void;
  /** Optional label for tracking */
  label?: string;
}

export interface SubagentResult {
  /** All messages from the subagent conversation */
  messages: Message[];
  /** Final text output */
  text: string;
  /** Whether the subagent completed successfully */
  success: boolean;
  /** Any error message */
  error?: string;
  /** Token usage */
  usage: { input_tokens: number; output_tokens: number };
}

// Track active subagents for cleanup
const activeSubagents = new Map<string, AbortController>();

export function getActiveSubagentCount(): number {
  return activeSubagents.size;
}

export function stopSubagent(id: string): boolean {
  const ctrl = activeSubagents.get(id);
  if (ctrl) {
    ctrl.abort();
    activeSubagents.delete(id);
    return true;
  }
  return false;
}

export function stopAllSubagents(): void {
  for (const [id, ctrl] of activeSubagents) {
    ctrl.abort();
    activeSubagents.delete(id);
  }
}

/**
 * Spawn a subagent with its own query loop.
 * Returns the subagent's conversation history.
 */
export async function spawnSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const {
    systemPrompt,
    messages = [],
    tools,
    parentContext,
    maxTurns = 10,
    onText,
    label = 'subagent',
  } = config;

  const agentId = `${label}_${generateId('a')}`;
  const abortController = new AbortController();
  activeSubagents.set(agentId, abortController);

  // Link to parent abort
  const parentSignal = parentContext.abortController.signal;
  const onParentAbort = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };
  if (!parentSignal.aborted) {
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const mutableMessages: Message[] = [...messages];
  let textOutput = '';

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (abortController.signal.aborted) {
        return {
          messages: mutableMessages,
          text: textOutput,
          success: false,
          error: 'Aborted',
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      }

      // Build API messages
      const apiMessages = toSubagentApiMessages(mutableMessages);
      const apiTools = tools
        .filter(t => t.name !== 'Bash' || label !== 'subagent')
        .map(t => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema as any,
          },
        }));

      const startTime = Date.now();
      let result;

      try {
        result = await streamChatCompletion(systemPrompt, apiMessages, apiTools, {
          signal: abortController.signal,
          model: getMainLoopModel(),
        });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return {
            messages: mutableMessages,
            text: textOutput,
            success: false,
            error: 'Aborted',
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        }
        throw err;
      }

      const duration = Date.now() - startTime;
      addToTotalDurationState(duration);
      addTokenUsage(result.usage.input_tokens, result.usage.output_tokens);

      // Build assistant content
      const assistantContent: Content[] = [];
      let accText = '';
      let toolCalls: any[] | null = null;

      for (const chunk of result.chunks) {
        if (chunk.type === 'text' && chunk.text) {
          accText += chunk.text;
          if (onText) onText(chunk.text);
          textOutput += chunk.text;
        } else if (chunk.type === 'tool_call' && chunk.tool_calls) {
          toolCalls = chunk.tool_calls;
        }
      }

      if (accText) {
        assistantContent.push({ type: 'text', text: accText });
      }
      if (toolCalls) {
        for (const tc of toolCalls) {
          assistantContent.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
          });
        }
      }

      if (assistantContent.length === 0) break;
      mutableMessages.push({ role: 'assistant', content: assistantContent });

      // Check for tool calls to execute
      const calls = assistantContent.filter(c => c.type === 'tool_use');
      if (calls.length === 0) break;

      const toolResults: Content[] = [];
      for (const call of calls) {
        if (call.type !== 'tool_use') continue;

        // For subagents, simplify: just report tool results as text
        // Full tool execution is complex; subagents mainly do research/delegation
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: [{ type: 'text', text: `[Subagent: ${call.name} called with ${JSON.stringify(call.input).slice(0, 200)}]` }],
          is_error: false,
        });
      }

      mutableMessages.push({ role: 'user', content: toolResults });
    }

    return {
      messages: mutableMessages,
      text: textOutput,
      success: true,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  } catch (err: any) {
    return {
      messages: mutableMessages,
      text: textOutput,
      success: false,
      error: err.message,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  } finally {
    activeSubagents.delete(agentId);
    parentSignal.removeEventListener('abort', onParentAbort);
  }
}

function toSubagentApiMessages(messages: Message[]): any[] {
  const result: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      result.push({ role: 'user', content: text || '(empty)' });
    } else if (msg.role === 'assistant') {
      const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      result.push({ role: 'assistant', content: text || null });
    }
  }
  return result;
}
