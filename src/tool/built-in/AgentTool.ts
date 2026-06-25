import { buildTool } from '../Tool.js';
import { runSubagent } from '../../services/subagent.js';

export const AgentTool = buildTool({
  name: 'Agent',
  description: 'Spawn a sub-agent for complex tasks. Set run_in_background=true for async execution.',
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
    const prompt = input.prompt as string;

    // DeLM integration
    const { isDelmMode, addDelmTask, publishToGist, registerAgent, updateAgentStatus } = await import('../../coordinator/index.js');
    if (isDelmMode()) {
      addDelmTask(prompt);
      registerAgent({ id: agentId, name: agentType, agentType, description: prompt.slice(0, 80), status: 'running', abortController: new AbortController() });
    }

    const onComplete = (result: { success: boolean; text: string }) => {
      if (isDelmMode()) {
        updateAgentStatus(agentId, result.success ? 'completed' : 'failed');
        publishToGist(result.success ? 'verified' : 'failure', agentId, result.text.slice(0, 500), [agentType]);
      }
    };

    if (runInBackground) {
      runSubagent({ prompt, agentType, parentContext: context, tools })
        .then(onComplete).catch(() => {});
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>running</status></task-notification>` }]};
    }

    try {
      const result = await runSubagent({ prompt, agentType, parentContext: context, tools });
      onComplete(result);
      const totalTokens = result.usage.input_tokens + result.usage.output_tokens;
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>${result.success ? 'completed' : 'failed'}</status>\n<result>${result.text.slice(0, 5000)}</result>\n<usage><total_tokens>${totalTokens}</total_tokens><tool_uses>${result.toolCallCount}</tool_uses></usage></task-notification>` }]};
    } catch (err: any) {
      return { content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>error</status><result>${err.message}</result></task-notification>` }], isError: true };
    }
  },
});
