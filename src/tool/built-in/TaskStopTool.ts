import { buildTool } from '../Tool.js';

export const TaskStopTool = buildTool({
  name: 'TaskStop',
  description: 'Stop a running agent by its ID. Use when an agent is going in the wrong direction or the task is no longer needed.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'The agent/task ID from a previous Agent tool call' },
    },
    required: ['task_id'],
  },
  async call(input) {
    const { stopAgent } = await import('../../coordinator/index.js');
    const taskId = input.task_id as string;
    const stopped = stopAgent(taskId);

    if (!stopped) {
      return {
        content: [{ type: 'text', text: `Error: No running agent found with ID "${taskId}".` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: `Agent ${taskId} has been stopped.` }],
    };
  },
});
