/**
 * Task system — ported from Claude Code's Task.ts and tasks.ts
 * Provides:
 * - Task lifecycle management (pending → running → completed/failed/killed)
 * - Task ID generation with type prefixes
 * - Task registry with type-based lookup
 * - Output file tracking
 */

import { generateId } from '../state/bootstrap.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ───

export type TaskType = 'local_bash' | 'local_agent' | 'remote_agent' | 'in_process_teammate' | 'local_workflow';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

const TYPE_PREFIXES: Record<TaskType, string> = {
  local_bash: 'b',
  local_agent: 'a',
  remote_agent: 'r',
  in_process_teammate: 't',
  local_workflow: 'w',
};

export function generateTaskId(type: TaskType): string {
  const prefix = TYPE_PREFIXES[type] ?? 'x';
  return prefix + '_' + generateId('t').slice(2);
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}

export interface TaskStateBase {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  toolUseId?: string;
  startTime: number;
  endTime?: number;
  totalPausedMs: number;
  outputFile: string;
  outputOffset: number;
  notified: boolean;
}

export interface TaskHandle {
  taskId: string;
  cleanup?: () => void;
}

export function createTaskStateBase(id: string, type: TaskType, description: string, toolUseId?: string): TaskStateBase {
  const outputDir = path.join(os.tmpdir(), 'yourca-tasks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return {
    id,
    type,
    status: 'pending',
    description,
    toolUseId,
    startTime: Date.now(),
    totalPausedMs: 0,
    outputFile: path.join(outputDir, `${id}.out`),
    outputOffset: 0,
    notified: false,
  };
}

export interface Task {
  name: string;
  type: TaskType;
  kill(taskId: string, setAppState?: (f: (prev: any) => any) => void): Promise<void>;
}

// ─── Task Registry ───

const taskRegistry: Task[] = [];

export function registerTask(task: Task): void {
  const existing = taskRegistry.findIndex(t => t.type === task.type);
  if (existing >= 0) {
    taskRegistry[existing] = task;
  } else {
    taskRegistry.push(task);
  }
}

export function getAllTasks(): Task[] {
  return [...taskRegistry];
}

export function getTaskByType(type: TaskType): Task | undefined {
  return taskRegistry.find(t => t.type === type);
}

// ─── Active Task State Management ───

const activeTasks = new Map<string, TaskStateBase>();

export function createTask(type: TaskType, description: string, toolUseId?: string): TaskStateBase {
  const id = generateTaskId(type);
  const state = createTaskStateBase(id, type, description, toolUseId);
  activeTasks.set(id, state);
  return state;
}

export function getTaskState(taskId: string): TaskStateBase | undefined {
  return activeTasks.get(taskId);
}

export function updateTaskStatus(taskId: string, status: TaskStatus): boolean {
  const task = activeTasks.get(taskId);
  if (!task) return false;
  task.status = status;
  if (isTerminalTaskStatus(status)) {
    task.endTime = Date.now();
  }
  return true;
}

export function appendTaskOutput(taskId: string, text: string): boolean {
  const task = activeTasks.get(taskId);
  if (!task) return false;
  try {
    fs.appendFileSync(task.outputFile, text, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function readTaskOutput(taskId: string, maxBytes?: number): string | null {
  const task = activeTasks.get(taskId);
  if (!task) return null;
  try {
    const content = fs.readFileSync(task.outputFile, 'utf-8');
    const start = task.outputOffset;
    // Read from offset, limit to maxBytes
    const slice = maxBytes ? content.slice(start, start + maxBytes) : content.slice(start);
    task.outputOffset = start + slice.length;
    return slice;
  } catch {
    return null;
  }
}

export function killAllTasks(): void {
  for (const [id, task] of activeTasks) {
    if (!isTerminalTaskStatus(task.status)) {
      updateTaskStatus(id, 'killed');
    }
  }
}

export function cleanupTask(taskId: string): boolean {
  const task = activeTasks.get(taskId);
  if (!task) return false;
  try {
    if (fs.existsSync(task.outputFile)) {
      fs.unlinkSync(task.outputFile);
    }
  } catch { /* ignore */ }
  return activeTasks.delete(taskId);
}

export function getActiveTaskCount(): number {
  let count = 0;
  for (const task of activeTasks.values()) {
    if (!isTerminalTaskStatus(task.status)) count++;
  }
  return count;
}
