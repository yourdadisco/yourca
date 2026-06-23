/**
 * YourCA config manager — stores API key in ~/.yourca/config.json
 * Following DeepSeek official CLI patterns.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = resolve(homedir(), '.yourca');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');

export interface YourCAConfig {
  api_key?: string;
  model?: string;
}

export function loadConfig(): YourCAConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Corrupted config — ignore
  }
  return {};
}

export function saveConfig(config: YourCAConfig): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const existing = loadConfig();
    const merged = { ...existing, ...config };
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Warning: Could not save config: ${err}`);
  }
}

export function requireApiKey(cliArg?: string): string {
  // Priority: CLI arg > config file > prompt
  if (cliArg) return cliArg;

  const config = loadConfig();
  if (config.api_key) return config.api_key;

  // Also check env var as fallback (but not required)
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;

  console.error('\x1b[31mError: DeepSeek API key not configured.\x1b[0m');
  console.error('\x1b[90mRun: yourca --setup\x1b[0m');
  console.error('\x1b[90mOr create ~/.yourca/config.json with: {"api_key": "sk-your-key"}\x1b[0m');
  process.exit(1);
}
