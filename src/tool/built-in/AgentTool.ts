import { buildTool } from '../Tool.js';

export const AgentTool = buildTool({
  name: 'Agent',
  description: 'Spawn a sub-agent for complex or multi-step tasks. The agent runs autonomously with its own tools.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task for the agent. Must be self-contained.' },
      subagent_type: { type: 'string', enum: ['general-purpose', 'explore', 'verify', 'worker'], description: 'Type of agent to spawn' },
      run_in_background: { type: 'boolean', description: 'Run in background (returns immediately, results come via task-notification)' },
    },
    required: ['prompt'],
  },
  async call(input, context) {
    const agentType = (input.subagent_type as string) ?? 'general-purpose';
    const runInBackground = input.run_in_background === true;
    const { runSubagent } = await import('../../services/subagent.js');
    const { isCoordinatorMode, isDelmMode, registerAgent, publishToGist, addDelmTask } = await import('../../coordinator/index.js');
    const appState = context.getAppState();
    const tools = appState?.tools ?? [];
    const agentId = `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const abortController = new AbortController();

    // Register for SendMessage/TaskStop
    registerAgent({
      id: agentId,
      name: agentType,
      agentType,
      status: 'running',
      abortController,
      description: (input.prompt as string).slice(0, 100),
    });

    // In DeLM mode, add to task queue
    if (isDelmMode()) {
      addDelmTask(input.prompt as string);
    }

    // In coordinator mode or run_in_background, run async
    const shouldRunAsync = runInBackground || isCoordinatorMode();

    if (shouldRunAsync) {
      // Fire and forget — runs in background
      runSubagent({
        prompt: input.prompt as string,
        agentType,
        parentContext: context,
        tools,
        maxTurns: 50,
      }).then(result => {
        const { updateAgentStatus } = require('../../coordinator/index.js');
        updateAgentStatus(agentId, result.success ? 'completed' : 'failed');

        // In DeLM mode, publish result to gist
        if (isDelmMode()) {
          const { publishToGist } = require('../../coordinator/index.js');
          publishToGist(
            result.success ? 'verified' : 'failure',
            agentId,
            result.text.slice(0, 500),
            [agentType],
          );
        }

        // Notify via console (in full REPL this would be a proper notification)
        console.log(`\n[Agent ${agentId}] ${result.success ? 'completed' : 'failed'}`);
      }).catch(() => {});

      return {
        content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>running</status><summary>Agent spawned in background</summary></task-notification>` }],
      };
    }

    // Synchronous execution
    try {
      const result = await runSubagent({
        prompt: input.prompt as string,
        agentType,
        parentContext: context,
        tools,
      });

      const status = result.success ? 'completed' : 'failed';
      const totalTokens = result.usage.input_tokens + result.usage.output_tokens;
      const resultText = result.text ? `\n<result><![CDATA[${result.text}]]></result>` : '';

      return {
        content: [{
          type: 'text',
          text: `<task-notification>\n<task-id>${agentId}</task-id>\n<status>${status}</status>${resultText}\n<usage>\n  <total_tokens>${totalTokens}</total_tokens>\n  <tool_uses>${result.toolCallCount}</tool_uses>\n</usage>\n</task-notification>`,
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `<task-notification><task-id>${agentId}</task-id><status>error</status><result>${err.message}</result></task-notification>` }],
        isError: true,
      };
    }
  },
});
