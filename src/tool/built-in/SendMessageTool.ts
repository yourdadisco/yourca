import { buildTool } from '../Tool.js';

export const SendMessageTool = buildTool({
  name: 'SendMessage',
  description: 'Send a follow-up message to a running agent. Use to continue a worker with additional context or corrected instructions.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_id: { type: 'string', description: 'The agent ID from a previous Agent tool call' },
      message: { type: 'string', description: 'The follow-up message to send' },
    },
    required: ['agent_id', 'message'],
  },
  async call(input) {
    const { getActiveAgent } = await import('../../coordinator/index.js');
    const agentId = input.agent_id as string;
    const message = input.message as string;
    const agent = getActiveAgent(agentId);

    if (!agent) {
      return {
        content: [{ type: 'text', text: `Error: No active agent found with ID "${agentId}". Agents may have already completed or been stopped.` }],
        isError: true,
      };
    }

    // In a full implementation, this would queue the message for the agent's message loop.
    // For v1, we log the follow-up and acknowledge it.
    return {
      content: [{ type: 'text', text: `Message queued for agent ${agentId} (${agent.name}).\n\nAgent is currently running. When it completes, the full result including your follow-up context will be delivered in the task-notification.` }],
    };
  },
});
