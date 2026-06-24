/**
 * Compact prompts — structured summarization prompts for the LLM.
 * The model is instructed to produce <analysis> (scratchpad, stripped)
 * followed by <summary> (structured, preserved).
 */

const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts.

In your analysis, chronologically go through each section and identify:
1. The user's explicit requests and intents
2. Your approach and key decisions
3. Specific file names, code snippets, function signatures
4. Errors encountered and how they were fixed
5. User feedback and corrections

Your summary should include the following sections:

1. Primary Request and Intent: Capture all user requests in detail
2. Key Technical Concepts: Technologies, frameworks, patterns discussed
3. Files and Code Sections: Specific files examined or modified, with important snippets
4. Errors and Fixes: All errors and how they were resolved
5. Problem Solving: Problems solved and ongoing efforts
6. All User Messages: List ALL user messages that are not tool results
7. Pending Tasks: Any explicitly requested pending work
8. Current Work: Precisely what was being worked on before this summary
9. Optional Next Step: The next step most directly related to the most recent work

Here's the format:

<example>
<analysis>
[Your thought process]
</analysis>

<summary>
1. Primary Request and Intent:
   [Details]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]

3. Files and Code Sections:
   - [File]: [Summary of changes/snippets]

4. Errors and Fixes:
   - [Error]: [How fixed]

...

9. Optional Next Step:
   [Next step]
</summary>
</example>
`;

const NO_TOOLS_TRAILER = '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — an <analysis> block followed by a <summary> block.';

/**
 * Get the full compact prompt, optionally with custom instructions.
 */
export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT;

  if (customInstructions && customInstructions.trim()) {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }

  prompt += NO_TOOLS_TRAILER;
  return prompt;
}

/**
 * Get a prompt for partial compact (summarize only recent messages).
 */
export function getPartialCompactPrompt(customInstructions?: string): string {
  const partialPrompt = `Your task is to create a summary of the RECENT portion of the conversation.
Earlier messages are being kept intact. Focus only on recent messages.

${BASE_COMPACT_PROMPT}`;

  let prompt = NO_TOOLS_PREAMBLE + partialPrompt;
  if (customInstructions?.trim()) {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }
  prompt += NO_TOOLS_TRAILER;
  return prompt;
}

/**
 * Format the compact summary by stripping <analysis> scratchpad
 * and converting <summary> tags into readable markdown.
 */
export function formatCompactSummary(summary: string): string {
  let formatted = summary;

  // Strip analysis section
  formatted = formatted.replace(/<analysis>[\s\S]*?<\/analysis>/g, '');

  // Extract and format summary section
  const summaryMatch = formatted.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    const content = summaryMatch[1] || '';
    formatted = formatted.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    );
  }

  // Clean up extra whitespace
  formatted = formatted.replace(/\n\n\n+/g, '\n\n');
  return formatted.trim();
}

/**
 * Build the user-facing summary message injected after compaction.
 */
export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
): string {
  const formatted = formatCompactSummary(summary);
  let base = `This session continues from a previous conversation that was compacted. Below is a summary of what happened before.

${formatted}`;

  if (suppressFollowUpQuestions) {
    base += `\n\nContinue the conversation from where it left off. Do not acknowledge the summary, do not recap. Pick up the last task as if the break never happened.`;
  }

  return base;
}
