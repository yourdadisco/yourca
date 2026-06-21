import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { buildTool } from '../Tool.js';

export const GrepTool = buildTool({
  name: 'Grep',
  description: 'Content search across files using ripgrep or Node.js fallback.',
  userFacingName: 'Grep',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search in' },
      glob: { type: 'string', description: 'Glob filter (e.g. "*.ts")' },
      output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], default: 'files_with_matches' },
      context: { type: 'number', description: 'Lines of context before and after each match' },
      caseInsensitive: { type: 'boolean', description: 'Case insensitive search' },
      head_limit: { type: 'number', description: 'Limit output lines', default: 250 },
    },
    required: ['pattern'],
  },
  async call(input) {
    try {
      const searchPath = (input.path as string) ?? process.cwd();
      const mode = (input.output_mode as string) ?? 'files_with_matches';
      const limit = (input.head_limit as number) ?? 250;
      const pattern = input.pattern as string;

      // Try ripgrep first
      try {
        const args: string[] = ['--no-heading', '--color=never'];
        if (input.caseInsensitive) args.push('-i');
        if (input.glob) args.push('--glob', input.glob as string);
        if (input.context) args.push('-C', String(input.context));

        switch (mode) {
          case 'count': args.push('-c'); break;
          case 'content': args.push('-n'); break;
          default: args.push('-l', '-N');
        }

        const cmd = `rg ${args.join(' ')} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)}`;
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] });
        const lines = output.trim().split('\n').slice(0, limit);
        return {
          content: [{ type: 'text', text: lines.join('\n') || 'No matches found.' }],
        };
      } catch {
        // Fallback: simple Node.js recursive search
        function searchDir(dir: string, depth = 0): string[] {
          if (depth > 5) return [];
          const results: string[] = [];
          try {
            for (const entry of readdirSync(dir)) {
              const fullPath = join(dir, entry);
              try {
                const s = statSync(fullPath);
                if (s.isDirectory()) {
                  if (!entry.startsWith('.') && entry !== 'node_modules') {
                    results.push(...searchDir(fullPath, depth + 1));
                  }
                } else if (s.isFile()) {
                  try {
                    const content = readFileSync(fullPath, 'utf-8');
                    const flags = input.caseInsensitive ? 'gi' : 'g';
                    const regex = new RegExp(pattern, flags);
                    if (regex.test(content)) {
                      results.push(fullPath);
                    }
                  } catch { /* binary file */ }
                }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
          return results;
        }

        const results = searchDir(searchPath).slice(0, limit);
        return {
          content: [{ type: 'text', text: results.length ? results.join('\n') : 'No matches found.' }],
        };
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error searching: ${err.message}` }],
        isError: true,
      };
    }
  },
  isReadOnly: () => true,
});
