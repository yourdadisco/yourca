import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { buildTool } from '../Tool.js';

export const FileWriteTool = buildTool({
  name: 'Write',
  description: 'Create a new file or overwrite an existing one with the given content.',
  userFacingName: 'Write',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'The absolute path to the file' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['file_path', 'content'],
  },
  async call(input) {
    try {
      const filePath = input.file_path as string;
      const content = input.content as string;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return {
        content: [{ type: 'text', text: `File written: ${filePath} (${content.length} chars)` }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error writing file: ${err.message}` }],
        isError: true,
      };
    }
  },
  isDestructive: () => true,
});
