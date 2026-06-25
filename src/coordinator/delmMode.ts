/**
 * DeLM Mode — Decentralized Language Model agent coordination.
 *
 * No central coordinator. Agents communicate through:
 * 1. Shared Gist (verified facts, partial results, failure log)
 * 2. Task Queue (agents autonomously claim tasks)
 * 3. Capability Registry (agents advertise what they can do)
 *
 * Ported from Stanford's DeLM architecture (2026).
 */

import type { Message } from '../tool/Tool.js';
import { generateId } from '../state/bootstrap.js';

// ─── Types ───

export interface GistEntry {
  id: string;
  type: 'verified' | 'partial' | 'failure' | 'observation';
  agentId: string;
  content: string;
  timestamp: number;
  /** E.g., "auth-module", "button-component" — used for relevance matching */
  tags: string[];
}

export interface TaskItem {
  id: string;
  description: string;
  status: 'available' | 'claimed' | 'completed' | 'failed';
  claimedBy?: string;
  result?: string;
  createdAt: number;
  /** Dependencies — task IDs that must be completed first */
  dependsOn: string[];
}

export interface AgentCapability {
  agentType: string;
  tools: string[];
  description: string;
}

export interface AgentRegistration {
  id: string;
  name: string;
  capabilities: AgentCapability;
  status: 'idle' | 'busy' | 'completed';
}

// ─── Shared Gist Store ───

class GistStore {
  private entries: GistEntry[] = [];

  publish(entry: Omit<GistEntry, 'id' | 'timestamp'>): string {
    const id = `gist_${generateId('g')}`;
    this.entries.push({ ...entry, id, timestamp: Date.now() });
    return id;
  }

  getLatest(limit: number = 20): GistEntry[] {
    return this.entries.slice(-limit);
  }

  getByTags(tags: string[], limit: number = 10): GistEntry[] {
    return this.entries
      .filter(e => tags.some(t => e.tags.includes(t)))
      .slice(-limit);
  }

  getVerified(): GistEntry[] {
    return this.entries.filter(e => e.type === 'verified');
  }

  getFailures(limit: number = 10): GistEntry[] {
    return this.entries.filter(e => e.type === 'failure').slice(-limit);
  }

  clear(): void {
    this.entries = [];
  }

  count(): number {
    return this.entries.length;
  }
}

// ─── Task Queue ───

class TaskQueue {
  private tasks: TaskItem[] = [];

  add(description: string, options?: { dependsOn?: string[] }): string {
    const id = `task_${generateId('t')}`;
    this.tasks.push({
      id,
      description,
      status: 'available',
      createdAt: Date.now(),
      dependsOn: options?.dependsOn ?? [],
    });
    return id;
  }

  claim(agentId: string): TaskItem | null {
    // Check if there are any tasks whose dependencies are met
    for (const task of this.tasks) {
      if (task.status !== 'available') continue;
      if (task.dependsOn.length > 0) {
        const allDepMet = task.dependsOn.every(depId => {
          const dep = this.tasks.find(t => t.id === depId);
          return dep?.status === 'completed';
        });
        if (!allDepMet) continue;
      }
      task.status = 'claimed';
      task.claimedBy = agentId;
      return { ...task };
    }
    return null;
  }

  complete(taskId: string, result: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
    }
  }

  fail(taskId: string, error: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.result = error;
    }
  }

  getPending(): TaskItem[] {
    return this.tasks.filter(t => t.status === 'available');
  }

  getActive(): TaskItem[] {
    return this.tasks.filter(t => t.status === 'claimed');
  }

  getCompleted(): TaskItem[] {
    return this.tasks.filter(t => t.status === 'completed');
  }

  getAll(): TaskItem[] {
    return [...this.tasks];
  }

  allComplete(): boolean {
    return this.tasks.length > 0 && this.tasks.every(t => t.status === 'completed');
  }
}

// ─── Agent Registry ───

class AgentRegistry {
  private agents: AgentRegistration[] = [];

  register(name: string, capabilities: AgentCapability): string {
    const id = `agent_${generateId('a')}`;
    this.agents.push({ id, name, capabilities, status: 'idle' });
    return id;
  }

  setStatus(id: string, status: AgentRegistration['status']): void {
    const agent = this.agents.find(a => a.id === id);
    if (agent) agent.status = status;
  }

  findCapable(toolRequired: string): AgentRegistration[] {
    return this.agents.filter(a =>
      a.capabilities.tools.includes(toolRequired) ||
      a.capabilities.description.toLowerCase().includes(toolRequired.toLowerCase()),
    );
  }

  getAll(): AgentRegistration[] {
    return [...this.agents];
  }
}

// ─── Singleton State ───

const gistStore = new GistStore();
const taskQueue = new TaskQueue();
const agentRegistry = new AgentRegistry();

let delmActive = false;

// ─── Public API ───

export function isDelmMode(): boolean {
  return delmActive || process.env.YOURCA_DELM_MODE === "1";
}

export function setDelmMode(active: boolean): void {
  delmActive = active;
  if (!active) {
    gistStore.clear();
  }
}

// ─── Gist Operations ───

export function publishToGist(
  type: GistEntry['type'],
  agentId: string,
  content: string,
  tags: string[] = [],
): string {
  return gistStore.publish({ type, agentId, content, tags });
}

export function getLatestGist(limit?: number): GistEntry[] {
  return gistStore.getLatest(limit);
}

export function getVerifiedFacts(): GistEntry[] {
  return gistStore.getVerified();
}

export function getFailureLog(): GistEntry[] {
  return gistStore.getFailures();
}

// ─── Task Operations ───

export function addTask(description: string, options?: { dependsOn?: string[] }): string {
  return taskQueue.add(description, options);
}

export function claimNextTask(agentId: string): TaskItem | null {
  return taskQueue.claim(agentId);
}

export function completeTask(taskId: string, result: string): void {
  taskQueue.complete(taskId, result);
}

export function failTask(taskId: string, error: string): void {
  taskQueue.fail(taskId, error);
}

export function getTaskStatus(): {
  total: number;
  pending: number;
  active: number;
  completed: number;
  allDone: boolean;
} {
  const all = taskQueue.getAll();
  return {
    total: all.length,
    pending: taskQueue.getPending().length,
    active: taskQueue.getActive().length,
    completed: taskQueue.getCompleted().length,
    allDone: taskQueue.allComplete(),
  };
}

// ─── Agent Registry Operations ───

export function registerAgent(name: string, capabilities: AgentCapability): string {
  return agentRegistry.register(name, capabilities);
}

export function setAgentStatus(id: string, status: AgentRegistration['status']): void {
  agentRegistry.setStatus(id, status);
}

export function findAgents(tool: string): AgentRegistration[] {
  return agentRegistry.findCapable(tool);
}

export function getRegisteredAgents(): AgentRegistration[] {
  return agentRegistry.getAll();
}

// ─── System Prompt Builder ───

export function buildDelmSystemPrompt(): string {
  if (!delmActive) return '';

  const gist = gistStore.getLatest(10);
  const tasks = taskQueue.getPending();
  const verified = gistStore.getVerified();
  const failures = gistStore.getFailures(5);
  const agents = agentRegistry.getAll();

  const parts: string[] = [
    `## Decentralized Multi-Agent Mode (DeLM)`,
    ``,
    `You are operating in a decentralized agent swarm. There is NO central coordinator.`,
    `Each agent works autonomously by:`,
    `1. Reading the shared Gist (verified facts, progress, failures)`,
    `2. Claiming tasks from the Task Queue`,
    `3. Publishing results back to the Gist`,
    ``,
    `### Shared Gist (Latest ${gist.length} entries)`,
    gist.length > 0
      ? gist.map(e => `[${e.type} by ${e.agentId}]: ${e.content.slice(0, 200)}`).join('\n')
      : '(empty — you are the first agent)',
    ``,
    `### Verified Facts (${verified.length})`,
    verified.length > 0
      ? verified.map(e => `- ${e.content}`).join('\n')
      : '(none yet)',
    ``,
    failures.length > 0
      ? `### Known Failures (avoid repeating)\n${failures.map(f => `- ${f.content}`).join('\n')}`
      : '',
    ``,
    `### Available Tasks (${tasks.length})`,
    tasks.length > 0
      ? tasks.map(t => `- [${t.id}] ${t.description}`).join('\n')
      : '(no pending tasks — propose new tasks or broadcast results)',
    ``,
    `### Registered Agents (${agents.length})`,
    agents.length > 0
      ? agents.map(a => `- ${a.name} (${a.id}): ${a.capabilities.description}`).join('\n')
      : '(none)',
    ``,
    `### Guidelines`,
    `- Claim ONE task at a time`,
    `- Publish verified facts to Gist when done`,
    `- If you fail, publish the failure so others avoid it`,
    `- If all tasks are done and no more work, report "all tasks complete"`,
    `- You can add new tasks if you discover more work needed`,
  ];

  return parts.join('\n');
}

/**
 * Broadcast a verification result to the shared gist.
 * This is called when any agent completes work with verification.
 */
export function broadcastVerification(
  agentId: string,
  what: string,
  result: 'passed' | 'failed',
  details: string,
): void {
  const tags = ['verification', what.toLowerCase().replace(/\s+/g, '-')];
  gistStore.publish({
    type: result === 'passed' ? 'verified' : 'failure',
    agentId,
    content: `[Verification: ${what}] ${result.toUpperCase()}: ${details}`,
    tags,
  });
}
