/**
 * Tests for permissions.ts — covering isReadOnly behavior in checkToolPermission.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Tool, ToolPermissionContext } from './Tool.js';
import { checkToolPermission, createDefaultPermissionContext, filterToolsByDenyRules, formatPermissionRules } from './permissions.js';

// ── Helper: create a mock tool ──────────────────────────────────────────────
function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'TestTool',
    description: 'A test tool',
    inputSchema: {},
    call: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    isReadOnly: () => false,
    isDestructive: () => false,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('checkToolPermission — isReadOnly behavior', () => {

  it('should allow read-only tools in auto mode', () => {
    const tool = makeTool({ name: 'Read', isReadOnly: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should ask for destructive tools in auto mode', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'ask');
  });

  it('should allow non-destructive, non-read-only tools in auto mode', () => {
    const tool = makeTool({ name: 'SomeTool', isReadOnly: () => false, isDestructive: () => false });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should allow read-only tools in default mode', () => {
    const tool = makeTool({ name: 'Read', isReadOnly: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'default',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should ask for destructive tools in default mode', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'default',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'ask');
  });

  it('should allow non-destructive, non-read-only tools in default mode', () => {
    const tool = makeTool({ name: 'SomeTool', isReadOnly: () => false, isDestructive: () => false });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'default',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should deny tools matching alwaysDeny rules even if read-only', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
      alwaysDenyRules: { Bash: [] },
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'deny');
  });

  it('should allow tools matching alwaysAllow rules even if destructive', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
      alwaysAllowRules: { Bash: [] },
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should allow read-only tools in auto mode even if alwaysAsk is set (isReadOnly check comes before alwaysAsk)', () => {
    // In auto mode, isReadOnly is checked before alwaysAsk rules,
    // so a read-only tool gets allowed first.
    const tool = makeTool({ name: 'Read', isReadOnly: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
      alwaysAskRules: { Read: [] },
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should ask for tools matching alwaysAsk rules when not read-only in auto mode', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => false });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
      alwaysAskRules: { Bash: [] },
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'ask');
  });

  it('should bypass in bypass mode regardless of isReadOnly', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'bypass',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'bypass');
  });

  it('should allow in accept mode regardless of isReadOnly', () => {
    const tool = makeTool({ name: 'Bash', isReadOnly: () => false, isDestructive: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'accept',
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'allow');
  });

  it('should pass through updatedInput when allowing', () => {
    const tool = makeTool({ name: 'Read', isReadOnly: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
    };
    const input = { path: '/test/file.txt' };
    const result = checkToolPermission(tool, input, ctx);
    assert.equal(result.behavior, 'allow');
    assert.deepEqual(result.updatedInput, input);
  });

  it('should use isReadOnly with input parameter', () => {
    // Some tools check input to determine if they're read-only
    const tool = makeTool({
      name: 'ConditionalTool',
      isReadOnly: (input?: Record<string, unknown>) => {
        return input?.action === 'read';
      },
    });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
    };
    // With read action — should be allowed
    const result1 = checkToolPermission(tool, { action: 'read' }, ctx);
    assert.equal(result1.behavior, 'allow');
    // With write action — not read-only, not destructive, so allowed by default
    const result2 = checkToolPermission(tool, { action: 'write' }, ctx);
    assert.equal(result2.behavior, 'allow');
  });

  it('should deny read-only tool if alwaysDeny takes priority', () => {
    const tool = makeTool({ name: 'Read', isReadOnly: () => true });
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      mode: 'auto',
      alwaysDenyRules: { Read: [] },
    };
    const result = checkToolPermission(tool, {}, ctx);
    assert.equal(result.behavior, 'deny');
  });
});

describe('createDefaultPermissionContext', () => {
  it('should return a context with default mode', () => {
    const ctx = createDefaultPermissionContext();
    assert.equal(ctx.mode, 'default');
    assert.deepEqual(ctx.alwaysAllowRules, {});
    assert.deepEqual(ctx.alwaysDenyRules, {});
    assert.deepEqual(ctx.alwaysAskRules, {});
    assert.equal(ctx.isBypassPermissionsModeAvailable, false);
    assert.equal(ctx.isAutoModeAvailable, false);
  });
});

describe('formatPermissionRules', () => {
  it('should format rules with mode', () => {
    const ctx = createDefaultPermissionContext();
    const output = formatPermissionRules(ctx);
    assert.match(output, /Permission mode: default/);
  });

  it('should include alwaysAllow rules', () => {
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      alwaysAllowRules: { Read: [] },
    };
    const output = formatPermissionRules(ctx);
    assert.match(output, /Always allowed: Read/);
  });
});

describe('filterToolsByDenyRules', () => {
  it('should filter out denied tools', () => {
    const tools = [
      makeTool({ name: 'Read' }),
      makeTool({ name: 'Bash' }),
      makeTool({ name: 'Write' }),
    ];
    const ctx: ToolPermissionContext = {
      ...createDefaultPermissionContext(),
      alwaysDenyRules: { Bash: [] },
    };
    const filtered = filterToolsByDenyRules(tools, ctx);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].name, 'Read');
    assert.equal(filtered[1].name, 'Write');
  });

  it('should return all tools if no deny rules', () => {
    const tools = [makeTool({ name: 'Read' }), makeTool({ name: 'Bash' })];
    const ctx = createDefaultPermissionContext();
    const filtered = filterToolsByDenyRules(tools, ctx);
    assert.equal(filtered.length, 2);
  });
});
