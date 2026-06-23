import { readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { buildTool } from '../Tool.js';

export const GlobTool = buildTool({
  name: 'Glob',
  description: 'Fast file pattern matching. Returns matching file paths sorted by modification time.',
  userFacingName: 'Glob',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The glob pattern (e.g. "**/*.ts") or file extension filter (e.g. "*.ts")' },
      path: { type: 'string', description: 'The directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },
  async call(input) {
    try {
      const searchDir = (input.path as string) ?? process.cwd();
      const pattern = input.pattern as string;

      // Simple recursive file finder (basic glob support)
      const results: string[] = [];
      const extFilter = pattern.startsWith('**/*') ? pattern.slice(4) : pattern.startsWith('*.') ? pattern.slice(1) : null;

      function walkDir(dir: string, depth: number): void {
        if (depth > 8) return;
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.startsWith('.') && entry !== '.claude') continue;
          if (entry === 'node_modules') continue;
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              walkDir(fullPath, depth + 1);
            } else if (stat.isFile()) {
              if (!extFilter || entry.endsWith(extFilter)) {
                results.push(relative(searchDir, fullPath));
              }
            }
          } catch { /* skip */ }
        }
      }

      walkDir(resolve(searchDir), 0);

      // Sort by mtime (newest first)
      results.sort((a, b) => {
        try { return statSync(b).mtimeMs - statSync(a).mtimeMs; }
        catch { return 0; }
      });

      const output = results.length === 0
        ? 'No files found matching pattern.'
        : results.slice(0, 500).join('\n') + (results.length > 500 ? `\n... and ${results.length - 500} more` : '');
      return { content: [{ type: 'text', text: output }] };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error globbing: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
