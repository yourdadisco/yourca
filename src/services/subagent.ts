import type { Tool, Message, Content, ToolUseContext } from '../tool/Tool.js';
import { findToolByName } from '../tool/Tool.js';
import { streamChatCompletion } from '../query/api.js';
import { getMainLoopModel, addToTotalCostState, addToTotalDurationState, addTokenUsage } from '../state/bootstrap.js';
import { findAgent } from '../coordinator/agentRegistry.js';
import { classifyError, logError } from './errors.js';

export interface SubagentConfig {
  prompt: string;
  agentType?: string;
  parentContext: ToolUseContext;
  tools: readonly Tool[];
  maxTurns?: number;
}

export interface SubagentResult {
  text: string;
  success: boolean;
  error?: string;
  usage: { input_tokens: number; output_tokens: number };
  toolCallCount: number;
}

export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const agent = findAgent(config.agentType ?? 'general-purpose');
  const systemPrompt = agent?.getSystemPrompt({ toolUseContext: { options: config.parentContext.options } }) ?? 'You are a helpful assistant.';
  const maxTurns = config.maxTurns ?? agent?.maxTurns ?? 20;
  const abortController = new AbortController();
  const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text: config.prompt }] }];
  let textOutput = '';
  let toolCallCount = 0;
  let totalInput = 0;
  let totalOutput = 0;

  // Link parent abort
  const parentSignal = config.parentContext.abortController.signal;
  const onAbort = () => { if (!abortController.signal.aborted) abortController.abort(); };
  if (!parentSignal.aborted) parentSignal.addEventListener('abort', onAbort, { once: true });

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (abortController.signal.aborted) {
        return { text: textOutput, success: false, error: 'Aborted', usage: { input_tokens: totalInput, output_tokens: totalOutput }, toolCallCount };
      }

      // Filter tools by agent definition
      let availableTools = config.tools;
      if (agent) {
        if (agent.disallowedTools && agent.disallowedTools.length > 0) {
          availableTools = availableTools.filter(t => !agent.disallowedTools!.includes(t.name));
        }
        if (agent.tools && agent.tools[0] !== '*' && agent.tools.length > 0) {
          availableTools = availableTools.filter(t => agent.tools!.includes(t.name));
        }
      }

      const apiTools = availableTools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));

      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') || null,
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
          return { text: textOutput, success: false, error: 'Aborted', usage: { input_tokens: totalInput, output_tokens: totalOutput }, toolCallCount };
        }
        throw err;
      }

      const duration = Date.now() - startTime;
      addToTotalDurationState(duration);
      addTokenUsage(result.usage.input_tokens, result.usage.output_tokens);
      totalInput += result.usage.input_tokens;
      totalOutput += result.usage.output_tokens;

      // Build assistant content
      const assistantContent: Content[] = [];
      let text = '';
      let toolCalls: any[] = [];

      for (const chunk of result.chunks) {
        if (chunk.type === 'text' && chunk.text) text += chunk.text;
        else if (chunk.type === 'tool_call' && chunk.tool_calls) toolCalls = chunk.tool_calls;
      }

      if (text) {
        assistantContent.push({ type: 'text', text });
        textOutput += text;
      }
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
      }
      if (assistantContent.length === 0) break;

      messages.push({ role: 'assistant', content: assistantContent });

      // Execute tool calls IN PROCESS
      const toolUseBlocks = assistantContent.filter(c => c.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;
      toolCallCount += toolUseBlocks.length;

      const toolResults: Content[] = [];
      for (const call of toolUseBlocks) {
        const tool = findToolByName(config.tools, call.name);
        if (!tool) {
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: [{ type: 'text', text: `Error: Unknown tool "${call.name}"` }], is_error: true });
          continue;
        }
        try {
          const toolResult = await tool.call(call.input, config.parentContext);
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: toolResult.content, is_error: toolResult.isError });
        } catch (err: any) {
          toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: [{ type: 'text', text: `Error: ${err.message}` }], is_error: true });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }
  } catch (err: any) {
    return { text: textOutput, success: false, error: err.message, usage: { input_tokens: totalInput, output_tokens: totalOutput }, toolCallCount };
  } finally {
    parentSignal.removeEventListener('abort', onAbort);
  }

  return { text: textOutput, success: true, usage: { input_tokens: totalInput, output_tokens: totalOutput }, toolCallCount };
}
