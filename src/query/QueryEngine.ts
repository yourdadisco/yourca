/**
 * QueryEngine — the core conversation loop.
 * Adapted for DeepSeek OpenAI-compatible API.
 */
import type { Message, Content, Tool, ToolUseContext, ToolPermissionContext, ToolResultContent } from '../tool/Tool.js';
import { findToolByName } from '../tool/Tool.js';
import { toolToApiDefinition } from '../tool/tools.js';
import { streamChatCompletion } from './api.js';
import { addToTotalCostState, addToTotalDurationState, addTokenUsage, incrementTurnCount } from '../state/bootstrap.js';
import { estimateMessagesTokens } from './messages.js';
import { isGoalModeActive, getGoalState, completeGoal, incrementIteration } from '../services/goalEngine.js';
import { runSubagent } from '../services/subagent.js';

const DEEPSEEK_PRICING = { input: 0.00027, output: 0.0011 };

export type QueryEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result_text'; name: string; result: string }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: string }
  | { type: 'usage'; input_tokens: number; output_tokens: number; total_tokens: number };

export interface QueryConfig {
  messages: Message[];
  systemPrompt: string;
  tools: readonly Tool[];
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
  const maxTurns = config.maxTurns ?? 25;
  const abortController = config.abortController ?? new AbortController();
  const onEvent = config.onEvent ?? (() => {});

  const mutableMessages: Message[] = [...messages];
  let turnCount = 0;

  while (turnCount < maxTurns) {
    turnCount++;
    incrementTurnCount();

    const toolUseContext: ToolUseContext = {
      abortController,
      getAppState: () => ({}),
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
      result = await streamChatCompletion(systemPrompt, apiMessages, apiTools, {
        signal: abortController.signal,
      });
    } catch (err: any) {
      onEvent({ type: 'error', message: `API error: ${err.message}` });
      throw err;
    }

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

    for (const block of assistantContent) {
      if (block.type === 'text' && block.text) {
        onEvent({ type: 'text', text: block.text });
      }
    }

    const toolCalls = assistantContent.filter(
      (c): c is Content & { type: 'tool_use' } => c.type === 'tool_use',
    );

    if (toolCalls.length === 0) {
      // Auto goal verification: if goal active and model stopped making tool calls
      if (isGoalModeActive()) {
        const lastAsst = mutableMessages.filter(m => m.role === 'assistant').pop();
        const lastAsstText = lastAsst?.content.filter(c => c.type === 'text').map(c => c.text).join('\n') ?? '';
        const goalState = getGoalState();

        if (goalState && lastAsstText) {
          const verifyPrompt = [
            '# Verification Task',
            '',
            'Verify whether the following goal has been COMPLETELY achieved.',
            '',
            'Goal: ' + goalState.goal,
            '',
            'What was done this iteration:',
            lastAsstText.slice(0, 2000),
            '',
            'Respond with exactly one of:',
            'PASS: <reason why goal is met>',
            'FAIL: <what is missing or wrong>',
          ].join('\n');

          try {
            const verifyResult = await runSubagent({
              prompt: verifyPrompt,
              agentType: 'verify',
              parentContext: toolUseContext,
              tools,
            });

            const verifyText = verifyResult.text;
            if (verifyText.startsWith('PASS')) {
              completeGoal('Goal verified: ' + verifyText.replace('PASS:', '').trim());
              mutableMessages.push({
                role: 'user',
                content: [{ type: 'text', text: '[Goal verification: PASSED - ' + verifyText.replace('PASS:', '').trim() + ']' }],
              });
              onEvent({ type: 'done', reason: 'goal_completed' });
              return mutableMessages;
            } else {
              incrementIteration();
              const feedback = verifyText.replace('FAIL:', '').trim();
              mutableMessages.push({
                role: 'user',
                content: [{ type: 'text', text: '[Goal verification: FAILED - ' + feedback + ']' + ' Please fix the issues and try again.' }],
              });
              // Continue the loop for another iteration
              continue;
            }
          } catch {
            // If verification agent fails, fall through to normal completion
          }
        }
      }

      onEvent({ type: 'done', reason: 'completed' });
      return mutableMessages;
    }

    if (result.finishReason === 'length' || result.finishReason === 'error') {
      onEvent({ type: 'done', reason: result.finishReason });
      return mutableMessages;
    }

    // Execute tool calls
    const toolResults: Content[] = [];
    for (const toolCall of toolCalls) {
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

    // Context window management
    const estimatedTokens = estimateMessagesTokens(mutableMessages);
    if (estimatedTokens > 120_000) {
      const lastMsgs = mutableMessages.slice(-6);
      mutableMessages.length = 0;
      mutableMessages.push(
        { role: 'user', content: [{ type: 'text', text: `[Context compacted. Continuing...]` }] },
        ...lastMsgs,
      );
    }
  }

  // Goal verification at max turns with visible progress
  if (isGoalModeActive()) {
    const { completeGoal, incrementIteration, getGoalState } = await import('../services/goalEngine.js');
    const { runSubagent } = await import('../services/subagent.js');
    const lastAsst = mutableMessages.filter(m => m.role === 'assistant').pop();
    const lastAsstText = lastAsst?.content.filter(c => c.type === 'text').map(c => c.text).join('\n') ?? '';
    const goalState = getGoalState();
    if (goalState && lastAsstText) {
      try { onEvent({ type: 'text', text: '\n[Goal 🔍 Verifying...]\n' }); } catch {}
      // Inject verification status into the conversation so the model sees it
      const verifyPrompt = `# Verification Task\n\nVerify whether the goal has been COMPLETELY achieved.\n\nGoal: ${goalState.goal}\n\nWhat was done:\n${lastAsstText.slice(0, 2000)}\n\nRespond with exactly:\nPASS: <reason>\nFAIL: <what is missing>`;
      try {
        const verifyCtx = { abortController, getAppState: () => ({ tools }), setAppState: () => {}, messages: [], permissionContext, options: {} };
        const verifyResult = await runSubagent({ prompt: verifyPrompt, agentType: 'verify', parentContext: verifyCtx as any, tools });
        if (verifyResult.text.startsWith('PASS')) {
          completeGoal('Goal verified: ' + verifyResult.text.replace('PASS:', '').trim());
          onEvent({ type: 'text', text: '\n[Goal ✅ VERIFIED: ' + verifyResult.text.replace('PASS:', '').trim() + ']\n' });
          onEvent({ type: 'done', reason: 'goal_completed' });
          return mutableMessages;
        } else {
          incrementIteration();
          onEvent({ type: 'text', text: '\n[Goal ❌ NOT YET: ' + verifyResult.text.replace('FAIL:', '').trim() + ']\n' });
          onEvent({ type: 'text', text: '[↻ Iteration ' + goalState.iteration + ' continuing...]\n' });
        }
      } catch {}
    }
  }

  onEvent({ type: 'done', reason: 'max_turns' });
  return mutableMessages;
}
