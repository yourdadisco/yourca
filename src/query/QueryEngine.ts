/**
 * QueryEngine — the core conversation loop.
 * Enterprise port from Claude Code's QueryEngine.ts with:
 * - Context window management with automatic compaction
 * - Tool permission checking
 * - Proper abort handling
 * - Stream processing with usage tracking
 * - Per-model cost tracking
 * - Error classification and retry
 */

import type { Message, Content, Tool, ToolUseContext, ToolPermissionContext, ToolResultContent } from '../tool/Tool.js';
import { findToolByName } from '../tool/Tool.js';
import { checkToolPermission } from '../tool/permissions.js';
import { toolToApiDefinition } from '../tool/tools.js';
import { streamChatCompletion } from './api.js';
import { addToTotalCostState, addToTotalDurationState, addTokenUsage, incrementTurnCount, getMainLoopModel } from '../state/bootstrap.js';
import { estimateMessagesTokens } from '../services/compact.js';
import { microcompactMessages, autoCompactIfNeeded, shouldAutoCompact, buildPostCompactMessages, getAutoCompactState, resetAutoCompactState } from '../services/compact/index.js';
import { classifyError, logError } from '../services/errors.js';
import { createUserMessage } from './messages.js';
import { enhanceSystemPrompt, autoSave } from '../services/vectorMemory/index.js';
import { getArchitectureSystemPrompt } from '../coordinator/index.js';
import { isGoalModeActive, buildGoalSystemPrompt, checkGoalCompletion, completeGoal, incrementIteration } from '../services/goalEngine.js';

const DEEPSEEK_PRICING = { input: 0.00027, output: 0.0011 };
const MAX_TURNS = 50;

export type QueryEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_start'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result_text'; name: string; result: string }
  | { type: 'tool_denied'; name: string; reason?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: string }
  | { type: 'usage'; input_tokens: number; output_tokens: number; total_tokens: number }
  | { type: 'compact' }
  | { type: 'retry'; attempt: number; message: string };

export interface QueryConfig {
  messages: Message[];
  systemPrompt: string;
  tools: readonly Tool[];
  model?: string;
  maxTurns?: number;
  abortController?: AbortController;
  permissionContext: ToolPermissionContext;
  onEvent?: (event: QueryEvent) => void;
  requestPrompt?: (prompt: string, options?: { timeout?: number }) => Promise<string>;
}

function textFromToolResult(content: ToolResultContent[]): string {
  return content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

/** Convert internal messages to OpenAI API format */
function toOpenAIMessages(messages: Message[]): any[] {
  const result: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const toolResults = msg.content.filter(c => c.type === 'tool_result');
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          const tResult = tr as Content & { type: 'tool_result' };
          const textContent = tResult.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
          result.push({ role: 'tool', tool_call_id: tResult.tool_use_id, content: textContent });
        }
      } else {
        const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        result.push({ role: 'user', content: text || '(empty)' });
      }
    } else if (msg.role === 'assistant') {
      const text = msg.content.filter((c): c is Content & { type: 'text' } => c.type === 'text').map(c => c.text).join('\n');
      const toolCalls = msg.content.filter((c): c is Content & { type: 'tool_use' } => c.type === 'tool_use');
      const entry: any = { role: 'assistant', content: text || null };
      if (toolCalls.length > 0) {
        entry.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
      }
      result.push(entry);
    }
  }
  return result;
}

/** Convert OpenAI format tool_calls back to internal Content blocks */
function toolCallsToContent(toolCalls: any[]): Content[] {
  return toolCalls.map((tc: any) => ({
    type: 'tool_use' as const,
    id: tc.id,
    name: tc.function.name,
    input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
  }));
}

export async function runQuery(config: QueryConfig): Promise<Message[]> {
  const { messages, systemPrompt, tools, permissionContext } = config;
  const model = config.model ?? getMainLoopModel();
  const maxTurns = config.maxTurns ?? MAX_TURNS;
  const abortController = config.abortController ?? new AbortController();
  const onEvent = config.onEvent ?? (() => {});

  const mutableMessages: Message[] = [...messages];
  let turnCount = 0;
  let consecutiveErrors = 0;

  while (turnCount < maxTurns) {
    turnCount++;
    incrementTurnCount();
    if (isGoalModeActive()) incrementIteration();
    consecutiveErrors++;

    // Check for abort
    if (abortController.signal.aborted) {
      onEvent({ type: 'done', reason: 'aborted' });
      return mutableMessages;
    }

    // L1: micro-compact every turn (zero LLM)
    const mcResult = microcompactMessages(mutableMessages);
    if (mcResult.toolResultsCleared > 0) {
      mutableMessages.length = 0;
      mutableMessages.push(...mcResult.messages);
    }

    // L2-L4: auto-compact when approaching token limit
    if (shouldAutoCompact(mutableMessages, model)) {
      onEvent({ type: 'compact' });
      const result = await autoCompactIfNeeded(mutableMessages, model, {
        systemPrompt,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        abortSignal: abortController.signal,
        querySource: 'repl_main_thread',
      });

      if (result.wasCompacted && result.compactionResult) {
        const built = buildPostCompactMessages(result.compactionResult);
        mutableMessages.length = 0;
        mutableMessages.push(...built);
      } else if (result.consecutiveFailures && result.consecutiveFailures > 2) {
        // Circuit breaker tripped — log but continue
        onEvent({ type: 'error', message: 'Auto-compact failed after multiple attempts.' });
      }
    }

    const toolUseContext: ToolUseContext = {
      abortController,
      getAppState: () => ({ tools }),
      setAppState: () => {},
      messages: mutableMessages,
      permissionContext,
      requestPrompt: config.requestPrompt,
    };

    const apiMessages = toOpenAIMessages(mutableMessages);
    const apiTools = tools.map(t => toolToApiDefinition(t));

    const startTime = Date.now();
    let result;

    try {
      const lastUserMsg = mutableMessages.filter(m => m.role === 'user').pop();
      const queryText = lastUserMsg
        ? lastUserMsg.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
        : '';
      // Inject architecture-specific prompt (coordinator/delm/normal)
      let finalPrompt = systemPrompt;
      const archPrompt = getArchitectureSystemPrompt();
      if (archPrompt) finalPrompt += '\n\n' + archPrompt;
      // Inject goal prompt if /goal is active
      if (isGoalModeActive()) {
        const goalPrompt = buildGoalSystemPrompt();
        if (goalPrompt) finalPrompt += '\n\n' + goalPrompt;
      }
      const enhancedPrompt = await enhanceSystemPrompt(finalPrompt, queryText).catch(() => finalPrompt);
      result = await streamChatCompletion(enhancedPrompt, apiMessages, apiTools, {
        signal: abortController.signal,
        model,
      });
    } catch (err: any) {
      const classified = classifyError(err);
      logError(err);

      if (err.name === 'AbortError') {
        onEvent({ type: 'done', reason: 'aborted' });
        return mutableMessages;
      }

      onEvent({ type: 'error', message: `API error: ${err.message}` });

      // Retry logic for retryable errors
      if (classified.retryable && consecutiveErrors <= 3) {
        const delay = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 8000);
        onEvent({ type: 'retry', attempt: consecutiveErrors, message: err.message });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable or too many retries
      return mutableMessages;
    }

    // Reset consecutive errors on success
    consecutiveErrors = 0;

    const duration = Date.now() - startTime;
    const cost =
      (result.usage.input_tokens / 1000) * DEEPSEEK_PRICING.input +
      (result.usage.output_tokens / 1000) * DEEPSEEK_PRICING.output;

    addToTotalCostState(cost);
    addToTotalDurationState(duration);
    addTokenUsage(result.usage.input_tokens, result.usage.output_tokens);

    onEvent({
      type: 'usage',
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      total_tokens: result.usage.total_tokens,
    });

    // Build assistant content from stream chunks
    const assistantContent: Content[] = [];
    let accumulatedText = '';
    let accumulatedToolCalls: any[] | null = null;

    for (const chunk of result.chunks) {
      if (chunk.type === 'text') {
        accumulatedText += (chunk.text ?? '');
      } else if (chunk.type === 'tool_call' && chunk.tool_calls) {
        if (accumulatedText) {
          assistantContent.push({ type: 'text', text: accumulatedText });
          accumulatedText = '';
        }
        accumulatedToolCalls = chunk.tool_calls;
      }
    }

    if (accumulatedText) {
      assistantContent.push({ type: 'text', text: accumulatedText });
    }
    if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
      assistantContent.push(...toolCallsToContent(accumulatedToolCalls));
    }
    if (assistantContent.length === 0) {
      assistantContent.push({ type: 'text', text: '' });
    }

    mutableMessages.push({ role: 'assistant', content: assistantContent });

    // Emit text events
    for (const block of assistantContent) {
      if (block.type === 'text' && block.text) {
        onEvent({ type: 'text', text: block.text });
      }
    }

    // Auto-save assistant text
    const assistantText = assistantContent.filter(c => c.type === 'text').map(c => c.text).join('\n');
    if (assistantText.trim()) {
      autoSave(assistantText).catch(() => {});
    }

    // Check goal completion after each assistant turn
    if (isGoalModeActive()) {
      const { isComplete, reason } = checkGoalCompletion(mutableMessages);
      if (isComplete) {
        completeGoal(reason);
        onEvent({ type: 'done', reason: 'goal_completed' });
        return mutableMessages;
      }
    }

    const toolCalls = assistantContent.filter(
      (c): c is Content & { type: 'tool_use' } => c.type === 'tool_use',
    );

    // No tool calls — conversation finished
    if (toolCalls.length === 0) {
      onEvent({ type: 'done', reason: 'completed' });
      // Save final assistant message
      const lastAsst = mutableMessages.filter(m => m.role === 'assistant').pop();
      if (lastAsst) {
        const text = lastAsst.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        if (text.trim()) autoSave(text).catch(() => {});
      }
      return mutableMessages;
    }

    // Check finish reason
    if (result.finishReason === 'length' || result.finishReason === 'error') {
      onEvent({ type: 'done', reason: result.finishReason });
      return mutableMessages;
    }

    // Execute tool calls with permission checks
    const toolResults: Content[] = [];
    for (const toolCall of toolCalls) {
      if (abortController.signal.aborted) break;

      const tool = findToolByName(tools, toolCall.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: [{ type: 'text', text: `Error: Unknown tool "${toolCall.name}"` }],
          is_error: true,
        });
        continue;
      }

      // Permission check
      const permissionResult = checkToolPermission(tool, toolCall.input, permissionContext);
      if (permissionResult.behavior === 'deny') {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: [{ type: 'text', text: `Permission denied: ${permissionResult.message ?? 'Tool not allowed'}` }],
          is_error: true,
        });
        onEvent({ type: 'tool_denied', name: toolCall.name, reason: permissionResult.message });
        continue;
      }

      // If permission asks, we auto-allow in the current mode
      // In full mode, this would prompt the user

      onEvent({ type: 'tool_start', name: toolCall.name, input: toolCall.input });
      try {
        const toolResult = await tool.call(toolCall.input, toolUseContext);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: toolResult.content,
          is_error: toolResult.isError,
        });
        const resultText = textFromToolResult(toolResult.content).slice(0, 1000);
        onEvent({ type: 'tool_result_text', name: toolCall.name, result: resultText });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          is_error: true,
        });
        onEvent({ type: 'error', message: `Tool ${toolCall.name} failed: ${err.message}` });
      }
    }

    mutableMessages.push({ role: 'user', content: toolResults });
  }

  onEvent({ type: 'done', reason: 'max_turns' });
  return mutableMessages;
}
