import { spawn } from 'child_process';
import { buildTool } from '../Tool.js';
import { getCwdState } from '../../state/bootstrap.js';

export const BashTool = buildTool({
  name: 'Bash',
  description: 'Execute shell commands in the terminal. Long-running commands are killed after 120s by default.',
  userFacingName: 'Bash',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      description: { type: 'string', description: 'A clear description of what this command does' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)', default: 120000 },
      dangerouslyDisableSandbox: { type: 'boolean', description: 'Allow destructive commands', default: false },
    },
    required: ['command'],
  },
  async call(input) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) ?? 120_000, 600_000);
    const cwd = getCwdState();

    return new Promise((resolve) => {
      const child = spawn(command, [], {
        shell: true,
        cwd,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PATH: process.env.PATH },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeout);

      child.on('exit', (exitCode) => {
        clearTimeout(timer);
        const combined = stdout + (stderr ? `\nstderr:\n${stderr}` : '');
        const output = `Exit code: ${exitCode}\n${combined.slice(0, 100_000)}`;
        resolve({
          content: [{ type: 'text', text: output }],
          isError: exitCode !== 0 && exitCode !== null,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      });
    });
  },
  isDestructive: () => true,
});
