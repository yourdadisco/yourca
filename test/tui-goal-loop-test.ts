/**
 * TUI Goal Loop Test
 *
 * Spawns yourca as a child process and tests the goal-verify loop:
 * 1. Set a goal via /goal
 * 2. Send a query to trigger the AI
 * 3. Verify the AI attempts to complete the goal
 * 4. Check if verify agent runs (internal PASS/FAIL cycle)
 * 5. Check goal status via /goal
 * 6. Log everything to logs/tui-goal-loop.log
 */

import { spawn } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_PATH = path.resolve(PROJECT_ROOT, 'logs', 'tui-goal-loop.log');

// ─── Logging ───

function log(msg: string) {
  fs.appendFileSync(LOG_PATH, msg, 'utf-8');
  process.stdout.write(msg);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// ─── Process wrapper ───

interface ProcessHandle {
  /** Full accumulated output so far (ansi-stripped) */
  output: () => string;
  /** Raw bytes output (with ANSI codes) */
  rawOutput: () => string;
  /** Send a line of input */
  send: (text: string) => void;
  /** Kill the process */
  kill: () => void;
  /** Promise that resolves when process exits */
  onExit: Promise<void>;
}

function spawnCLI(): ProcessHandle {
  const entryPoint = path.resolve(PROJECT_ROOT, 'src', 'index.ts');

  let rawOutput = '';

  const proc = spawn('npx', ['tsx', entryPoint], {
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
      YOURCA_MODEL: process.env.YOURCA_MODEL || 'deepseek-chat',
    },
  });

  let resolveExit: () => void = () => {};
  const onExit = new Promise<void>((r) => { resolveExit = r; });

  proc.stdout!.on('data', (data: Buffer) => {
    rawOutput += data.toString('utf-8');
  });
  proc.stderr!.on('data', (data: Buffer) => {
    rawOutput += data.toString('utf-8');
  });
  proc.on('close', () => resolveExit());
  proc.on('error', (err) => {
    log(`[SPAWN ERROR] ${err.message}\n`);
    resolveExit();
  });

  return {
    output: () => stripAnsi(rawOutput),
    rawOutput: () => rawOutput,
    send: (text: string) => proc.stdin!.write(text + '\n'),
    kill: () => { try { proc.kill(9); } catch {} },
    onExit,
  };
}

// ─── Wait helper: wait for a marker to appear in NEW output (past cursor) ───

function makeOutputTracker(getOutput: () => string) {
  let cursor = 0;

  /** Wait for marker in output AFTER the cursor. Resolves when found, advancing cursor. */
  function waitFor(marker: string | string[], timeoutMs: number): Promise<string> {
    const markers = Array.isArray(marker) ? marker : [marker];
    const startCursor = cursor;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = () => {
        if (Date.now() - startTime > timeoutMs) {
          const tail = getOutput().slice(startCursor).slice(-300);
          reject(new Error(`Timeout after ${timeoutMs}ms waiting for "${markers[0]}". Tail: "${tail}"`));
          return;
        }
        const newPart = getOutput().slice(startCursor);
        for (const m of markers) {
          const idx = newPart.indexOf(m);
          if (idx !== -1) {
            cursor = startCursor + idx + m.length;
            resolve(getOutput());
            return;
          }
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  /** Current cursor position */
  function getCursor() { return cursor; }

  return { waitFor, getCursor };
}

// ─── Main ───

async function main() {
  // Clear previous log
  try { fs.unlinkSync(LOG_PATH); } catch {}

  log('=======================================\n');
  log('  TUI Goal Loop Test\n');
  log(`  Date: ${new Date().toISOString()}\n`);
  log(`  Project: ${PROJECT_ROOT}\n`);
  log(`  Log: ${LOG_PATH}\n`);
  log('=======================================\n\n');

  // Check API key
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    log('[SKIP] DEEPSEEK_API_KEY not set -- cannot run AI tests.\n');
    process.exit(0);
  }
  log(`[INFO] API key found: ${apiKey.slice(0, 12)}...\n\n`);

  // Spawn
  log('--- Step 1: Spawn yourca ---\n');
  const cli = spawnCLI();
  const out = () => cli.output();
  const tracker = makeOutputTracker(out);

  try {
    // Wait for initial startup (look for the banner + prompt markers)
    log('Waiting for startup...\n');
    await tracker.waitFor('> ', 20000);
    log('[OK] Prompt received (yourca started)\n\n');

    log('--- Step 2: Set goal via /goal ---\n');
    cli.send('/goal "list all TypeScript files in src/"');

    // Wait for the goal output and next prompt
    await tracker.waitFor('Goal set', 20000);
    await new Promise((r) => setTimeout(r, 1000));
    const afterGoal = out();
    const goalSetOk = afterGoal.includes('Goal set');
    log(`[${goalSetOk ? 'OK' : 'WARN'}] Goal set: ${goalSetOk ? 'Goal was set' : 'Goal output not found'}\n`);
    if (!goalSetOk) {
      const snippet = afterGoal.slice(-500);
      log(`  Last output: ${snippet.replace(/\n/g, '\\n')}\n`);
    }
    log('\n');

    // Send query to trigger AI
    log('--- Step 3: Send query to trigger AI ---\n');
    log('Sending: "list all TypeScript files in src/"\n');
    log('This will trigger the AI and the goal-verify loop...\n\n');

    const queryStart = Date.now();
    cli.send('list all TypeScript files in src/');

    // Wait for AI to finish by monitoring output stability.
    // The AI outputs text in bursts. When output stops growing for
    // a sustained period, the AI is done.
    const AI_TIMEOUT = 180000; // 3 min max
    const IDLE_THRESHOLD = 15000; // 15s of no new data = done
    let lastLength = out().length;
    let idleStart = Date.now();
    let aiDone = false;

    while (Date.now() - queryStart < AI_TIMEOUT) {
      await new Promise((r) => setTimeout(r, 2000));
      const currentLength = out().length;
      if (currentLength > lastLength) {
        lastLength = currentLength;
        idleStart = Date.now();
      } else if (Date.now() - idleStart > IDLE_THRESHOLD) {
        // No new output for IDLE_THRESHOLD ms -- likely done
        aiDone = true;
        break;
      }
    }

    const aiDuration = ((Date.now() - queryStart) / 1000).toFixed(1);
    if (!aiDone) {
      log(`[WARN] AI response may not be complete after ${aiDuration}s (timeout)\n`);
    } else {
      log(`[OK] AI output appears complete after ${aiDuration}s (idle for ${IDLE_THRESHOLD / 1000}s)\n`);
    }

    // Give it a little more time to flush output
    await new Promise((r) => setTimeout(r, 3000));
    log('\n');

    // Analyze output
    log('--- Step 4: Analyze AI response ---\n');
    const cleanOut = out();

    // Tool usage (from tool_start events: "  🔧 Glob(...)")
    const hasGlob = /Glob/.test(cleanOut);
    const hasBash = /Bash/.test(cleanOut);
    const hasGrep = /Grep/.test(cleanOut);
    const hasRead = /Read/.test(cleanOut);
    const hasTool = hasGlob || hasBash || hasGrep || hasRead;

    // File listing
    const hasTsFiles = /src\/\S+\.ts/.test(cleanOut);
    const hasFileCount = /\b56\b/.test(cleanOut);
    const hasGoalCompleted = /goal\s+completed/i.test(cleanOut);

    // Verify agent activity: the verification result is injected as a user message
    // containing "[Goal verification: PASSED ...]" or "[Goal verification: FAILED ...]"
    // This text may appear in the AI's response if it echoes the verification.
    const hasVerifyPass = /Goal verification:\s*PASS/i.test(cleanOut);
    const hasVerifyFail = /Goal verification:\s*FAIL/i.test(cleanOut);
    const hasVerifyAny = hasVerifyPass || hasVerifyFail;
    // Also check for verify agent name
    const hasVerifyAgentName = /verify\s+agent/i.test(cleanOut);

    log('Tool usage:\n');
    log(`  Glob: ${hasGlob ? 'YES' : 'no'}\n`);
    log(`  Bash: ${hasBash ? 'YES' : 'no'}\n`);
    log(`  Grep: ${hasGrep ? 'YES' : 'no'}\n`);
    log(`  Read: ${hasRead ? 'YES' : 'no'}\n`);
    log(`  Any:  ${hasTool ? 'YES' : 'no'}\n\n`);

    log('File listing:\n');
    log(`  src/*.ts paths: ${hasTsFiles ? 'YES' : 'no'}\n`);
    log(`  Count (56):     ${hasFileCount ? 'YES' : 'no'}\n`);
    log(`  Goal completed: ${hasGoalCompleted ? 'YES' : 'no'}\n\n`);

    log('Verify agent:\n');
    log(`  PASS result:  ${hasVerifyPass ? 'YES' : 'no'}\n`);
    log(`  FAIL result:  ${hasVerifyFail ? 'YES' : 'no'}\n`);
    log(`  Verify agent mentioned: ${hasVerifyAgentName ? 'YES' : 'no'}\n\n`);

    if (hasVerifyAny) {
      const lines = cleanOut.split('\n');
      const verifyLines = lines.filter(l => /Goal verification|verify agent/i.test(l));
      log('  Verify-related output:\n');
      for (const l of verifyLines.slice(0, 15)) {
        log(`    | ${l.trim()}\n`);
      }
      log('\n');
    }

    // Send /goal to check status (no args = show current goal status)
    log('--- Step 5: Check goal status via /goal ---\n');
    cli.send('/goal');
    // Wait for new output containing goal-specific info (Active Goal, No active goal, etc.)
    await tracker.waitFor(['Active Goal', 'No active', 'Goal set', 'Goal cleared'], 20000).catch((err) => {
      log(`  (wait warning: ${err.message})\n`);
    });
    // Small delay to capture all output
    await new Promise((r) => setTimeout(r, 2000));
    const statusOut = out();

    const hasGoalLine = /goal/i.test(statusOut);
    const hasIterLine = /[Ii]teration/.test(statusOut);
    const hasStatusLine = /[Ss]tatus/.test(statusOut);

    log(`Goal-related output: ${hasGoalLine ? 'YES' : 'no'}\n`);
    log(`Iteration counter:   ${hasIterLine ? 'YES' : 'no'}\n`);
    log(`Status line:         ${hasStatusLine ? 'YES' : 'no'}\n`);

    const goalLines = statusOut.split('\n').filter(l =>
      /goal|status|iteration|completed|active|failed/i.test(l)
    );
    if (goalLines.length > 0) {
      log('  Goal status output:\n');
      for (const l of goalLines.slice(0, 10)) {
        log(`    | ${l.trim()}\n`);
      }
    }
    log('\n');

    // ── Results ──
    log('=======================================\n');
    log('  RESULTS\n');
    log('=======================================\n\n');

    interface Check { name: string; pass: boolean; detail?: string }
    const checks: Check[] = [
      { name: 'Process starts and shows prompt', pass: /YourCA/.test(cleanOut) },
      { name: 'Goal set via /goal', pass: goalSetOk },
      { name: 'AI uses tools (Glob/Bash/etc.) to complete goal', pass: hasTool,
        detail: hasTool ? 'tools detected' : 'no tool calls visible' },
      { name: 'AI lists .ts files from src/', pass: hasTsFiles,
        detail: hasTsFiles ? 'src/*.ts paths found' : 'no .ts file paths' },
      { name: 'File count matches (56 files)', pass: hasFileCount,
        detail: hasFileCount ? 'count 56 found' : 'count not found' },
    ];

    if (hasVerifyAny) {
      checks.push({
        name: 'Goal-verify loop executed',
        pass: true,
        detail: hasVerifyPass ? 'Goal PASSED by verify agent' : 'Goal FAILED by verify agent',
      });
    } else {
      checks.push({
        name: 'Goal-verify loop check',
        pass: false,
        detail: 'verify result not visible in stdout (verify agent runs internally in QueryEngine)',
      });
    }

    // Check if we can retrieve goal status
    checks.push({
      name: 'Goal status retrievable via /goal',
      pass: hasGoalLine || hasStatusLine,
      detail: hasGoalLine ? 'goal info found' : 'no goal info in output',
    });

    let passCount = 0;
    let failCount = 0;
    for (const c of checks) {
      const tag = c.pass ? 'PASS' : 'FAIL';
      log(`  [${tag}] ${c.name}`);
      if (c.detail) log(`  -- ${c.detail}`);
      log('\n');
      if (c.pass) passCount++; else failCount++;
    }
    log(`\nTotal: ${checks.length} | Passed: ${passCount} | Failed: ${failCount}\n`);

    log('\n--- Activity Summary ---\n');
    if (hasGlob) log('  - AI used Glob to search for files\n');
    if (hasBash) log('  - AI used Bash to run shell commands\n');
    if (hasGrep) log('  - AI used Grep tool\n');
    if (hasRead) log('  - AI used Read tool\n');
    if (hasVerifyPass) log('  - Goal verification: PASSED\n');
    if (hasVerifyFail) log('  - Goal verification: FAILED\n');
    if (hasTool && !hasVerifyAny) log('  - Goal verification ran internally (not visible in stdout)\n');
    if (hasGoalCompleted) log('  - AI reported "goal completed"\n');
    log('\n');

  } catch (err: any) {
    log(`\n[ERROR] ${err.message}\n`);
    if (err.stack) log(`${err.stack}\n`);
    const partial = cli.output().slice(-2000);
    log('\n--- Last 2000 chars ---\n');
    log(partial);
    log('\n--- End ---\n');
  } finally {
    // Cleanup
    log('--- Cleanup: killing process ---\n');
    cli.kill();
    // Wait for exit with a timeout, so we don't hang
    try { await Promise.race([cli.onExit, new Promise((r) => setTimeout(r, 3000))]); } catch {}
    await new Promise((r) => setTimeout(r, 500));

    const full = cli.output();
    log('\n=======================================\n');
    log('  FULL RAW OUTPUT\n');
    log('=======================================\n\n');
    log(full);
    log('\n=======================================\n');
    log('  END FULL RAW OUTPUT\n');
    log('=======================================\n');
    log('\n=== TUI Goal Loop Test Complete ===\n');
  }

  process.exit(0);
}

main();
