import { readFile } from 'fs/promises';
import { buildTool } from '../Tool.js';

export const FileReadTool = buildTool({
  name: 'Read',
  description: 'Read the contents of a file. Provide offset/limit to read portions.',
  userFacingName: 'Read',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file' },
      offset: { type: 'number', description: 'Line number to start reading from' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },
  async call(input) {
    try {
      const filePath = input.file_path as string;
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const offset = (input.offset as number) ?? 1;
      const limit = (input.limit as number) ?? lines.length;
      const selected = lines.slice(offset - 1, offset - 1 + limit);
      const total = lines.length;
      const result = selected
        .map((line, i) => `${offset + i}\t${line}`)
        .join('\n');
      const summary =
        offset > 1 || limit < total
          ? `\n--- (showing ${selected.length} of ${total} lines, offset ${offset}) ---`
          : '';
      return {
        content: [{ type: 'text', text: result + summary }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error reading file: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
