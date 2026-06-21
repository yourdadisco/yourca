/**
 * Single non-interactive query mode (DeepSeek).
 */
import chalk from 'chalk';
import { getEnabledTools } from '../tool/tools.js';
import { buildSystemPrompt, getSystemContext, getUserContext } from '../context/context.js';
import { runQuery } from '../query/QueryEngine.js';
import { initAPI } from '../query/api.js';
import { createUserMessage } from '../query/messages.js';
import { setMainLoopModel } from '../state/bootstrap.js';
import { requireApiKey } from '../utils/config.js';

export async function runSingleQuery(prompt: string): Promise<void> {
  const tools = getEnabledTools();
  const apiKey = requireApiKey();
  initAPI({ apiKey });

  if (process.env.YOURCA_MODEL) {
    setMainLoopModel(process.env.YOURCA_MODEL);
  }

  const [sysCtx, userCtx] = await Promise.all([getSystemContext(), getUserContext()]);
  const systemPrompt = buildSystemPrompt(sysCtx, userCtx);
  const messages = [createUserMessage(prompt)];
  const { getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens } = await import('../state/bootstrap.js');

  let textOutput = '';

  await runQuery({
    messages,
    systemPrompt,
    tools: tools as any,
    maxTurns: 25,
    abortController: new AbortController(),
    permissionContext: { mode: 'accept', additionalWorkingDirectories: [] },
    onEvent: (event) => {
      switch (event.type) {
        case 'text': textOutput += event.text; break;
        case 'tool_start': console.error(chalk.gray(`  🔧 ${event.name}...`)); break;
        case 'usage': console.error(chalk.gray(`  Tokens: ${event.input_tokens}→${event.output_tokens}`)); break;
      }
    },
  });

  console.log(textOutput.trim());
  console.error(chalk.gray(`\n  Cost: $${getTotalCostUSD().toFixed(4)} | Tokens: ${getTotalInputTokens().toLocaleString()} in / ${getTotalOutputTokens().toLocaleString()} out`));
}
