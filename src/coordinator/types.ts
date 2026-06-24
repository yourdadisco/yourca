/**
 * Agent type definitions — ported directly from Claude Code's loadAgentsDir.ts.
 * Types match the source exactly; only MCP/hooks types are simplified since
 * yourca doesn't have those subsystems yet.
 */

// ─── Supporting Types ───

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'
export type EffortValue = EffortLevel | number
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const

export type PermissionMode = 'acceptEdits' | 'bypassPermissions' | 'default' | 'dontAsk' | 'plan' | 'auto' | 'bubble'

export type AgentMemoryScope = 'user' | 'project' | 'local'

export type SettingSource = 'userSettings' | 'projectSettings' | 'localSettings' | 'flagSettings' | 'policySettings'

export type AgentColorName = string

// ─── Base Agent Definition ───

export interface BaseAgentDefinition {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  skills?: string[]
  /** MCP servers specific to this agent — string name or inline config */
  mcpServers?: (string | { [name: string]: unknown })[]
  /** Session-scoped hooks registered when agent starts */
  hooks?: Record<string, unknown>
  color?: AgentColorName
  model?: string
  effort?: EffortValue
  permissionMode?: PermissionMode
  maxTurns?: number
  filename?: string
  baseDir?: string
  /** Short message re-injected at every user turn */
  criticalSystemReminder_EXPERIMENTAL?: string
  /** MCP server name patterns required for this agent to be available */
  requiredMcpServers?: string[]
  /** Always run as background task when spawned */
  background?: boolean
  /** Prepended to the first user turn (slash commands work) */
  initialPrompt?: string
  /** Persistent memory scope */
  memory?: AgentMemoryScope
  /** Run in an isolated git worktree */
  isolation?: 'worktree' | 'remote'
  /** Omit CLAUDE.md hierarchy from agent's userContext */
  omitClaudeMd?: boolean
  /** Pending memory snapshot update from project snapshot */
  pendingSnapshotUpdate?: { snapshotTimestamp: string }
}

// ─── Built-in Agent (code-defined, dynamic prompt) ───

export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in'
  baseDir: 'built-in'
  callback?: () => void
  getSystemPrompt: (params: {
    toolUseContext: { options?: { debug?: boolean; verbose?: boolean } }
  }) => string
}

// ─── Custom Agent (user/project settings, prompt from .md file) ───

export interface CustomAgentDefinition extends BaseAgentDefinition {
  getSystemPrompt: () => string
  source: SettingSource
  filename?: string
  baseDir?: string
}

// ─── Plugin Agent ───

export interface PluginAgentDefinition extends BaseAgentDefinition {
  getSystemPrompt: () => string
  source: 'plugin'
  filename?: string
  plugin: string
}

// ─── Union ───

export type AgentDefinition =
  | BuiltInAgentDefinition
  | CustomAgentDefinition
  | PluginAgentDefinition

// ─── Type Guards ───

export function isBuiltInAgent(agent: AgentDefinition): agent is BuiltInAgentDefinition {
  return agent.source === 'built-in'
}

export function isCustomAgent(agent: AgentDefinition): agent is CustomAgentDefinition {
  return agent.source !== 'built-in' && agent.source !== 'plugin'
}

export function isPluginAgent(agent: AgentDefinition): agent is PluginAgentDefinition {
  return agent.source === 'plugin'
}

// ─── Agent Registry Result ───

export interface AgentDefinitionsResult {
  activeAgents: AgentDefinition[]
  allAgents: AgentDefinition[]
  failedFiles?: Array<{ path: string; error: string }>
  allowedAgentTypes?: string[]
}
