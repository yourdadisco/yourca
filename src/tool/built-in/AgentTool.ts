import { buildTool, type ToolUseContext } from '../Tool.js';
import type { Tool } from '../Tool.js';
import { runSubagent } from '../../services/subagent.js';

export const AgentTool = buildTool({
  name: 'Agent',
  description: 'Spawn a sub-agent for complex or multi-step tasks. Set run_in_background=true for async execution.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task for the agent. Must be self-contained.' },
      subagent_type: { type: 'string', enum: ['general-purpose', 'explore', 'verify', 'worker'], description: 'Type of agent to spawn' },
      run_in_background: { type: 'boolean', description: 'Run in background (returns immediately, results via task-notification)' },
    },
    required: ['prompt'],
  },
  async call(input, context) {
    const agentType = (input.subagent_type as string) ?? 'general-purpose';
    const runInBackground = input.run_in_background === true;
    const tools = context.getAppState()?.tools ?? [];
    const agentId = `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    if (runInBackground) {
      // Async: register then return immediately
      import('../../coordinator/index.js').then(m => m.registerAgent({
        id: agentId, name: agentType, agentType, description: (input.prompt as string).slice(0, 80),
        status: 'running', abortController: new AbortController(), 
      }));
      runSubagent({ prompt: input.prompt as string, agentType, parentContext: context, tools })
        .then(result => {
          import('../../coordinator/index.js').then(m => m.updateAgentStatus(agentId, result.success ? 'completed' : 'failed'));
        }).catch(() => {});
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>running</status></task-notification>` }]};
    }

    // Sync: wait for result
    try {
      const result = await runSubagent({ prompt: input.prompt as string, agentType, parentContext: context, tools });
      const totalTokens = result.usage.input_tokens + result.usage.output_tokens;
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>${result.success ? 'completed' : 'failed'}</status>\n<result>${result.text.slice(0, 5000)}</result>\n<usage><total_tokens>${totalTokens}</total_tokens><tool_uses>${result.toolCallCount}</tool_uses></usage></task-notification>` }]};
    } catch (err: any) {
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>error</status><result>${err.message}</result></task-notification>` }], isError: true };
    }
  },
});
