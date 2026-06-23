import { readFile, writeFile } from 'fs/promises';
import { buildTool } from '../Tool.js';

export const FileEditTool = buildTool({
  name: 'Edit',
  description: 'Replace text in a file using exact string matching.',
  userFacingName: 'Edit',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file' },
      old_string: { type: 'string', description: 'The exact text to find' },
      new_string: { type: 'string', description: 'The text to replace it with' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  async call(input) {
    try {
      const filePath = input.file_path as string;
      const oldString = input.old_string as string;
      const newString = input.new_string as string;
      const replaceAll = (input.replace_all as boolean) ?? false;

      const content = await readFile(filePath, 'utf-8');
      let result: string;
      let count = 0;

      if (replaceAll) {
        const parts = content.split(oldString);
        count = parts.length - 1;
        result = parts.join(newString);
      } else {
        const idx = content.indexOf(oldString);
        if (idx === -1) {
          return {
            content: [{ type: 'text', text: `Error: Could not find exact match in ${filePath}` }],
            isError: true,
          };
        }
        count = 1;
        result = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
      }

      await writeFile(filePath, result, 'utf-8');
      return {
        content: [{ type: 'text', text: `Applied edit to ${filePath} (${count} replacement(s))` }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error editing file: ${err.message}` }],
        isError: true,
      };
    }
  },
  isDestructive: () => true,
});
