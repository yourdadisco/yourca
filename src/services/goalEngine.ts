/**
 * Goal Engine — Loop Engineering mode.
 *
 * Provides:
 * - Setting a session goal
 * - Tracking progress through iterations
 * - /goal command integration
 * - Auto-check of goal completion after each turn
 *
 * Inspired by Claude Code's /goal mode for iterative task completion.
 */

import type { Message } from '../tool/Tool.js';

// ─── Types ───

export interface GoalState {
  goal: string;
  status: 'active' | 'completed' | 'failed';
  iteration: number;
  startedAt: number;
  lastCheckMessage: string;
}

// ─── Module State ───

let goalState: GoalState | null = null;

// ─── API ───

/**
 * Set or update the current goal.
 */
export function setGoalMode(goal: string): void {
  goalState = {
    goal,
    status: 'active',
    iteration: 0,
    startedAt: Date.now(),
    lastCheckMessage: 'Goal set.',
  };
}

/**
 * Clear the current goal.
 */
export function clearGoal(): void {
  goalState = null;
}

/**
 * Check if a goal is active.
 */
export function isGoalModeActive(): boolean {
  return goalState !== null && goalState.status === 'active';
}

/**
 * Get current goal state.
 */
export function getGoalState(): GoalState | null {
  return goalState;
}

/**
 * Mark the current goal as completed.
 */
export function completeGoal(message?: string): void {
  if (goalState) {
    goalState.status = 'completed';
    goalState.lastCheckMessage = message ?? 'Goal completed.';
  }
}

/**
 * Mark the current goal as failed.
 */
export function failGoal(message?: string): void {
  if (goalState) {
    goalState.status = 'failed';
    goalState.lastCheckMessage = message ?? 'Goal failed.';
  }
}

/**
 * Increment iteration counter.
 */
export function incrementIteration(): void {
  if (goalState) {
    goalState.iteration++;
  }
}

/**
 * Build the goal system prompt to inject into the agent's context.
 */
export function buildGoalSystemPrompt(): string {
  if (!goalState || goalState.status !== 'active') return '';

  return `
## Active Session Goal
Goal: ${goalState.goal}
Iteration: ${goalState.iteration}

You are working toward this goal. After each action:
1. Verify if the goal is progressing
2. If completed, report "Goal completed: ${goalState.goal}"
3. If blocked, explain what's needed

Keep iterating until the goal is met. Do not stop after one attempt.`;
}

/**
 * Check if the last assistant message suggests the goal is complete.
 * This is a simple heuristic — looks for "goal completed" patterns.
 */
export function checkGoalCompletion(messages: Message[]): { isComplete: boolean; reason?: string } {
  if (!goalState || goalState.status !== 'active') {
    return { isComplete: false };
  }

  // Check the last assistant message for completion signals
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'assistant') {
      const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
      const lower = text.toLowerCase();

      // Look for goal completion indicators
      const completionPhrases = [
        'goal completed',
        'goal is complete',
        'all goals met',
        'task is complete',
        'finished the task',
      ];

      for (const phrase of completionPhrases) {
        if (lower.includes(phrase)) {
          return { isComplete: true, reason: phrase };
        }
      }
    }
  }

  return { isComplete: false };
}

/**
 * Get a goal progress message for display.
 */
export function getGoalProgressMessage(): string {
  if (!goalState) return '';
  const elapsed = Date.now() - goalState.startedAt;
  const elapsedStr = formatDuration(elapsed);

  switch (goalState.status) {
    case 'active':
      return `🎯 Goal in progress (${goalState.iteration} iterations, ${elapsedStr}): ${goalState.goal}`;
    case 'completed':
      return `✅ Goal completed (${goalState.iteration} iterations, ${elapsedStr}): ${goalState.goal}`;
    case 'failed':
      return `❌ Goal failed (${goalState.iteration} iterations, ${elapsedStr}): ${goalState.goal}`;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
