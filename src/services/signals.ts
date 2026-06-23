/**
 * Signal handling service — ported from Claude Code's signal infrastructure.
 * Manages:
 * - SIGINT (Esc/Escape) handling with double-tap to force quit
 * - SIGTERM graceful shutdown
 * - process cleanup
 */

import chalk from 'chalk';

export type SignalHandler = () => void | Promise<void>;

interface SignalConfig {
  /** Called on first SIGINT — should abort current operation */
  onInterrupt?: SignalHandler;
  /** Called on cleanup/exit */
  onShutdown?: SignalHandler;
  /** Called to get the current abort state */
  isAborted?: () => boolean;
}

let interruptCount = 0;
let interruptTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupDone = false;

/**
 * Register signal handlers for graceful interruption and shutdown.
 */
export function registerSignalHandlers(config: SignalConfig): () => void {
  const { onInterrupt, onShutdown, isAborted } = config;

  const handleSigint = async () => {
    interruptCount++;

    if (interruptTimer) {
      clearTimeout(interruptTimer);
      interruptTimer = null;
    }

    if (interruptCount >= 2) {
      // Double Ctrl+C — force quit
      console.error(chalk.yellow('\nForce quitting...'));
      await handleShutdown(onShutdown);
      process.exit(130);
      return;
    }

    // First SIGINT — abort current operation
    console.error(chalk.yellow('\n^C Interrupt (press Ctrl+C again to force quit)'));
    try {
      await onInterrupt?.();
    } catch { /* ignore interrupt handler errors */ }

    // Reset interrupt count after 2 seconds
    interruptTimer = setTimeout(() => {
      interruptCount = 0;
      interruptTimer = null;
    }, 2000);
  };

  const handleSigterm = async () => {
    if (cleanupDone) return;
    console.error(chalk.yellow('\nSIGTERM received, shutting down...'));
    await handleShutdown(onShutdown);
    process.exit(143);
  };

  const handleExit = async () => {
    await handleShutdown(onShutdown);
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);
  process.on('exit', handleExit);

  // Remove listeners on cleanup
  return () => {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
    process.removeListener('exit', handleExit);
    if (interruptTimer) clearTimeout(interruptTimer);
  };
}

async function handleShutdown(onShutdown?: SignalHandler): Promise<void> {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    await onShutdown?.();
  } catch { /* ignore shutdown errors */ }
}

/**
 * Reset interrupt tracking state.
 */
export function resetInterruptState(): void {
  interruptCount = 0;
  if (interruptTimer) {
    clearTimeout(interruptTimer);
    interruptTimer = null;
  }
}
