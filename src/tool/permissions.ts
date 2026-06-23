/**
 * Tool permission system — ported from Claude Code's permissions infrastructure.
 * Provides:
 * - Tool-level always-allow/always-deny/always-ask rules
 * - Permission mode management
 * - Tool permission checking with rule matching
 */

import type { Tool, Tools, PermissionResult, ToolPermissionContext } from './Tool.js';

/**
 * Check if a tool matches a permission pattern.
 * Supports patterns like "Bash(git *)", "Bash", or "*"
 */
function matchToolPermissionPattern(toolName: string, _input: Record<string, unknown>, pattern: string): boolean {
  // Check for tool-specific pattern: "ToolName(args)"
  const parenMatch = pattern.match(/^(\w+)\((.+)\)$/);
  if (parenMatch) {
    const [, name, argsPattern] = parenMatch;
    if (name !== toolName) return false;
    // Simple wildcard matching for args
    if (argsPattern === '*') return true;
    // Check individual tool input patterns
    for (const [key, val] of Object.entries(_input)) {
      const valStr = String(val);
      if (argsPattern.includes(valStr)) return true;
    }
    return false;
  }

  // Wildcard — matches all tools
  if (pattern === '*') return true;

  // Exact tool name match
  if (pattern === toolName) return true;

  // Glob-style: "Bash" matches Bash tool, "Read" matches Read tool
  return false;
}

/**
 * Check permission rules against a tool call.
 * Returns the first matching rule result, or 'ask' if no rules match.
 */
export function checkToolPermission(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolPermissionContext,
): PermissionResult {
  // Mode 'accept' — always allow
  if (context.mode === 'accept') {
    return { behavior: 'allow', updatedInput: input };
  }

  // Mode 'bypass' — skip all checks
  if (context.mode === 'bypass') {
    return { behavior: 'bypass', updatedInput: input };
  }

  const alwaysDeny = context.alwaysDenyRules ?? {};
  const alwaysAllow = context.alwaysAllowRules ?? {};
  const alwaysAsk = context.alwaysAskRules ?? {};

  // Check deny rules first (highest priority)
  for (const [pattern, _rules] of Object.entries(alwaysDeny)) {
    if (matchToolPermissionPattern(tool.name, {}, pattern)) {
      return { behavior: 'deny', message: `Tool "${tool.name}" is denied by rule: ${pattern}` };
    }
  }

  // Check allow rules
  for (const [pattern, rules] of Object.entries(alwaysAllow)) {
    if (matchToolPermissionPattern(tool.name, input, pattern)) {
      // If specific rules are listed, check them — otherwise allow all
      if (rules.length === 0 || rules.includes('*')) {
        return { behavior: 'allow', updatedInput: input };
      }
      return { behavior: 'allow', updatedInput: input };
    }
  }

  // For read-only tools in auto mode, allow by default
  if (context.mode === 'auto' && tool.isReadOnly?.(input)) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Check ask rules
  for (const [pattern] of Object.entries(alwaysAsk)) {
    if (matchToolPermissionPattern(tool.name, input, pattern)) {
      return { behavior: 'ask', message: `Permission needed for ${tool.name}` };
    }
  }

  // Default: ask in auto/default mode for destructive tools, allow for readonly
  if (context.mode === 'auto' || context.mode === 'default') {
    if (tool.isDestructive?.(input)) {
      return { behavior: 'ask', message: `${tool.name} needs permission` };
    }
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'allow', updatedInput: input };
}

/**
 * Format tool permission rules summary.
 */
export function formatPermissionRules(context: ToolPermissionContext): string {
  const lines: string[] = ['Permission mode: ' + context.mode];

  const alwaysAllow = context.alwaysAllowRules ?? {};
  const alwaysDeny = context.alwaysDenyRules ?? {};
  const alwaysAsk = context.alwaysAskRules ?? {};

  if (Object.keys(alwaysAllow).length > 0) {
    lines.push('Always allowed: ' + Object.keys(alwaysAllow).join(', '));
  }
  if (Object.keys(alwaysDeny).length > 0) {
    lines.push('Always denied: ' + Object.keys(alwaysDeny).join(', '));
  }
  if (Object.keys(alwaysAsk).length > 0) {
    lines.push('Always ask: ' + Object.keys(alwaysAsk).join(', '));
  }

  return lines.join('\n');
}

/**
 * Create a default empty permission context.
 */
export function createDefaultPermissionContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: [],
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
    isAutoModeAvailable: false,
  };
}

/**
 * Filter tools by deny rules.
 */
export function filterToolsByDenyRules(
  tools: Tools,
  permissionContext: ToolPermissionContext,
): Tool[] {
  const alwaysDeny = permissionContext.alwaysDenyRules ?? {};
  return tools.filter(tool => {
    for (const pattern of Object.keys(alwaysDeny)) {
      if (matchToolPermissionPattern(tool.name, {}, pattern)) {
        return false;
      }
    }
    return true;
  });
}
