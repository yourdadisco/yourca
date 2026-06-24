import { buildTool } from '../Tool.js';

export const AgentTool = buildTool({
  name: 'Agent',
  description: 'Spawn a sub-agent for complex or multi-step tasks. The agent runs autonomously with its own tools. Use this for research, implementation, or verification work that benefits from isolation.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task for the agent to perform. Must be self-contained with all context.' },
      subagent_type: {
        type: 'string',
        enum: ['general-purpose', 'explore', 'verify'],
        description: 'Type of agent to spawn',
      },
    },
    required: ['prompt'],
  },
  async call(input, context) {
    const { runSubagent } = await import('../../services/subagent.js');
    const prompt = input.prompt as string;
    const agentType = (input.subagent_type as string) ?? 'general-purpose';

    // Get tools from context
    const appState = context.getAppState();
    const tools = appState?.tools ?? [];

    try {
      const result = await runSubagent({
        prompt,
        agentType,
        parentContext: context,
        tools,
      });

      const status = result.success ? 'completed' : 'failed';
      const totalTokens = result.usage.input_tokens + result.usage.output_tokens;
      const resultText = result.text ? `\n<result><![CDATA[${result.text}]]></result>` : '';

      const xml = `<task-notification>
<task-id>agent_${Date.now().toString(36)}</task-id>
<status>${status}</status>${resultText}
<usage>
  <total_tokens>${totalTokens}</total_tokens>
  <tool_uses>${result.toolCallCount}</tool_uses>
</usage>
</task-notification>`;

      return { content: [{ type: 'text', text: xml }] };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `<task-notification><task-id>agent_${Date.now().toString(36)}</task-id><status>error</status><result>${err.message}</result></task-notification>` }],
        isError: true,
      };
    }
  },
});
