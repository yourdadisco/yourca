/**
 * Coordinator mode — ported from Claude Code's coordinator system.
 * Provides multi-agent orchestration with:
 * - Coordinator agent that delegates to worker agents
 * - Worker lifecycle management
 * - Task splitting and result synthesis
 * - Parallel execution support
 */

import { generateId } from '../state/bootstrap.js';

// ─── Types ───

export interface WorkerTask {
  id: string;
  prompt: string;
  tools?: string[];
  model?: string;
  maxTurns?: number;
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  text: string;
  error?: string;
  tokensUsed: { input: number; output: number };
}

export interface OrchestrationPlan {
  id: string;
  goal: string;
  workers: WorkerTask[];
  parallelGroups: number[][]; // Indices of workers that can run in parallel
}

// ─── Worker State ───

interface ActiveWorker {
  id: string;
  taskId: string;
  abortController: AbortController;
  startTime: number;
}

const activeWorkers = new Map<string, ActiveWorker>();
let coordinatorActive = false;

// ─── Coordinator Mode ───

export function isCoordinatorMode(): boolean {
  return coordinatorActive;
}

export function setCoordinatorMode(active: boolean): void {
  coordinatorActive = active;
}

export function getCoordinatorUserContext(): Record<string, string> {
  if (!coordinatorActive) return {};

  const workerTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'].sort().join(', ');

  return {
    workerToolsContext: `Workers spawned by the coordinator have access to these tools: ${workerTools}
The coordinator should decompose complex tasks into parallel subtasks:
- Research phase: spawn workers to gather information in parallel
- Synthesis phase: combine findings
- Implementation phase: spawn workers to make changes
- Verification phase: spawn workers to verify results

Each worker gets a self-contained prompt. The coordinator must synthesize the final output.`,
  };
}

export function getCoordinatorSystemPrompt(): string {
  if (!coordinatorActive) return '';

  return `You are an orchestration coordinator, not an executor.

## Your Role
- Decompose complex tasks into smaller, parallel subtasks
- Spawn workers via the Agent tool to execute subtasks
- Synthesize worker results into a coherent final response
- Verify that all parts of the task are complete

## Workflow
1. **Research** — Analyze the task and plan decomposition
2. **Spawn** — Launch workers with self-contained prompts
3. **Synthesize** — Combine results from all workers
4. **Verify** — Check completeness and correctness

## Guidelines
- Workers can run in parallel when they work on independent files
- Workers that modify the same file must run sequentially
- Each worker prompt must be complete and self-contained
- Always verify worker results before accepting them
- If a worker fails, spawn a new worker to fix the issue`;
}

// ─── Worker Management ───

export function createWorker(prompt: string, options?: { tools?: string[]; model?: string; maxTurns?: number }): WorkerTask {
  const id = `worker_${generateId('w').slice(2)}`;
  return {
    id,
    prompt,
    tools: options?.tools,
    model: options?.model,
    maxTurns: options?.maxTurns ?? 10,
  };
}

export function createOrchestrationPlan(goal: string): OrchestrationPlan {
  return {
    id: `plan_${generateId('p').slice(2)}`,
    goal,
    workers: [],
    parallelGroups: [],
  };
}

export function addWorkerToPlan(plan: OrchestrationPlan, worker: WorkerTask, parallelGroup?: number): void {
  const idx = plan.workers.length;
  plan.workers.push(worker);
  if (parallelGroup !== undefined) {
    const group = plan.parallelGroups.find(g => g[0] === parallelGroup);
    if (group) {
      group.push(idx);
    } else {
      plan.parallelGroups.push([idx]);
    }
  }
}

export function registerActiveWorker(taskId: string): string {
  const id = `active_${generateId('a').slice(2)}`;
  const worker: ActiveWorker = {
    id,
    taskId,
    abortController: new AbortController(),
    startTime: Date.now(),
  };
  activeWorkers.set(id, worker);
  return id;
}

export function getWorker(workerId: string): ActiveWorker | undefined {
  return activeWorkers.get(workerId);
}

export function stopWorker(workerId: string): boolean {
  const worker = activeWorkers.get(workerId);
  if (worker) {
    worker.abortController.abort();
    activeWorkers.delete(workerId);
    return true;
  }
  return false;
}

export function stopAllWorkers(): void {
  for (const [id, worker] of activeWorkers) {
    worker.abortController.abort();
    activeWorkers.delete(id);
  }
}

export function getActiveWorkerCount(): number {
  return activeWorkers.size;
}

export function getCoordinatorPromptAppendix(): string {
  if (!coordinatorActive) return '';

  return `

## Available Worker Tools
Workers have access to: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch

## Setting Up Workers
1. Define the worker's task clearly
2. Include all necessary context in the worker prompt
3. Set appropriate resource limits
4. Collect and synthesize worker outputs

## Orchestration Strategy
For multi-step tasks:
1. **Research** — Gather information first (parallel)
2. **Plan** — Design the solution
3. **Implement** — Execute changes (parallel where possible)
4. **Verify** — Test the results`;
}
