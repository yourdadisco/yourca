/**
 * Plugin system — ported from Claude Code's plugin infrastructure.
 * Provides:
 * - Plugin registration and discovery
 * - Plugin lifecycle management
 * - Plugin skill commands
 */

import type { SkillCommand, SkillSource } from '../skills/index.js';

// ─── Types ───

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  skills?: PluginSkillDef[];
  hooks?: Record<string, any>;
  mcpServers?: string[];
  defaultEnabled?: boolean;
}

export interface PluginSkillDef {
  name: string;
  description: string;
  prompt: string;
  whenToUse?: string;
}

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
  source: 'builtin' | 'user' | 'project';
  enabled: boolean;
  isBuiltin: boolean;
}

// ─── Registry ───

const pluginRegistry: Map<string, LoadedPlugin> = new Map();
const builtinPluginDefs: Map<string, PluginManifest> = new Map();

// ─── Built-in Plugin Registration ───

export function registerBuiltinPlugin(manifest: PluginManifest): void {
  builtinPluginDefs.set(manifest.name, manifest);
}

export function getBuiltinPlugins(): LoadedPlugin[] {
  const result: LoadedPlugin[] = [];

  for (const [name, manifest] of builtinPluginDefs) {
    result.push({
      name,
      manifest,
      source: 'builtin',
      enabled: manifest.defaultEnabled ?? true,
      isBuiltin: true,
    });
  }

  return result;
}

// ─── Plugin Loading ───

export function loadPlugin(manifest: PluginManifest, source: 'user' | 'project'): LoadedPlugin {
  const plugin: LoadedPlugin = {
    name: manifest.name,
    manifest,
    source,
    enabled: true,
    isBuiltin: false,
  };
  pluginRegistry.set(manifest.name, plugin);
  return plugin;
}

export function getPlugin(name: string): LoadedPlugin | undefined {
  return pluginRegistry.get(name);
}

export function getAllPlugins(): LoadedPlugin[] {
  return Array.from(pluginRegistry.values());
}

export function getEnabledPlugins(): LoadedPlugin[] {
  return Array.from(pluginRegistry.values()).filter(p => p.enabled);
}

export function removePlugin(name: string): boolean {
  return pluginRegistry.delete(name);
}

export function clearPlugins(): void {
  pluginRegistry.clear();
}

// ─── Plugin Skills ───

export function getPluginSkillCommands(): SkillCommand[] {
  const skills: SkillCommand[] = [];

  // Built-in plugins
  for (const plugin of getBuiltinPlugins()) {
    if (!plugin.enabled) continue;
    if (plugin.manifest.skills) {
      for (const skillDef of plugin.manifest.skills) {
        skills.push({
          type: 'prompt',
          name: skillDef.name,
          description: skillDef.description,
          whenToUse: skillDef.whenToUse,
          source: 'plugin' as SkillSource,
          hasUserSpecifiedDescription: true,
          getPromptForCommand: async () => skillDef.prompt,
        });
      }
    }
  }

  // Loaded plugins
  for (const plugin of getEnabledPlugins()) {
    if (plugin.manifest.skills) {
      for (const skillDef of plugin.manifest.skills) {
        skills.push({
          type: 'prompt',
          name: skillDef.name,
          description: skillDef.description,
          whenToUse: skillDef.whenToUse,
          source: 'plugin' as SkillSource,
          hasUserSpecifiedDescription: true,
          getPromptForCommand: async () => skillDef.prompt,
        });
      }
    }
  }

  return skills;
}

// ─── Init Built-in Plugins ───

export function initBuiltinPlugins(): void {
  registerBuiltinPlugin({
    name: 'git',
    description: 'Git integration for common git operations',
    version: '1.0.0',
    defaultEnabled: true,
  });

  registerBuiltinPlugin({
    name: 'search',
    description: 'Enhanced code search capabilities',
    version: '1.0.0',
    defaultEnabled: true,
  });
}
