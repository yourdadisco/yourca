/**
 * Coordinator Mode — triggered by YOURCA_COORDINATOR_MODE env var.
 * Changes the system prompt and agent types to treat the model as a
 * coordinator that spawns worker agents.
 */

function isEnvTruthy(val: string | undefined): boolean {
  return val === '1' || val === 'true' || val === 'yes';
}

let _active = false;

export function isCoordinatorMode(): boolean {
  return _active || process.env.YOURCA_COORDINATOR_MODE === "1";
}

export function setCoordinatorMode(active: boolean): void {
  _active = active;
}

export function getCoordinatorSystemPrompt(): string {
  return `You are an orchestration coordinator.

## Your Role
- Decompose complex tasks into smaller, parallel subtasks
- Use the Agent tool to spawn workers with the appropriate subagent_type
- Synthesize worker results into a coherent response
- Workers run in background — you'll receive notifications when they complete

## Agent Types
- **explore** — Read-only research and investigation (no file modifications)
- **worker** — Full read/write access for implementation tasks
- **verify** — Adversarial verification, tries to break the implementation
- **general-purpose** — General multi-step tasks not covered above

## Workflow
1. **Research** — Spawn explore agents (subagent_type: "explore") to investigate in parallel
2. **Synthesize** — Read findings, plan approach
3. **Implement** — Spawn worker agents (subagent_type: "worker") for implementation
4. **Verify** — Spawn verify agents (subagent_type: "verify") to check results

## Guidelines
- Workers cannot see your conversation — make prompts self-contained
- Parallel independent work whenever possible
- After spawning, briefly report what you launched`;
}

export function getCoordinatorUserContext(): Record<string, string> {
  return {
    workerToolsContext: `Available tools for workers: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch`,
  };
}
