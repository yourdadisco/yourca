import { getEnabledTools, toolToApiDefinition } from '../src/tool/tools.js';

const tools = getEnabledTools();
const agentDef = toolToApiDefinition(tools.find(t => t.name === 'Agent')!);
console.log('AgentTool definition sent to API:');
console.log(JSON.stringify(agentDef, null, 2));
console.log(`\nTotal tools: ${tools.length}`);
console.log('Tool names:', tools.map((t: any) => t.name).join(', '));
