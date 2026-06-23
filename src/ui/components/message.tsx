/**
 * MessageView — renders tool calls, results, and assistant messages.
 * Ported from Claude Code's AssistantToolUseMessage and tool result rendering.
 */

import React from 'react';
import { Text } from 'ink';
import { ThemedText, ThemedBox } from './themed.js';
import { Markdown } from './markdown.js';

interface ToolCallBlock {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
  id?: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  content: string;
  isError?: boolean;
}

interface TextBlock {
  type: 'text';
  content: string;
}

interface ThinkingBlock {
  type: 'thinking';
  content: string;
}

type MessageBlock = ToolCallBlock | ToolResultBlock | TextBlock | ThinkingBlock;

// ─── Tool Call ───

function ToolCallView({ block }: { block: ToolCallBlock }) {
  const preview = Object.values(block.input).find(v => typeof v === 'string')?.slice(0, 60) ?? '';
  return (
    <ThemedText color="info">
      {' '}🔧 {block.name}{preview ? `(${preview}…)` : ''}
    </ThemedText>
  );
}

// ─── Tool Result ───

function ToolResultView({ block }: { block: ToolResultBlock }) {
  const line1 = block.content.split('\n')[0].slice(0, 100);
  return (
    <ThemedBox paddingLeft={2}>
      <ThemedText color={block.isError ? 'error' : 'subtle'} dim>
        {block.isError ? '⚠' : '→'} {line1}
      </ThemedText>
    </ThemedBox>
  );
}

// ─── Thinking Block ───

function ThinkingView({ block }: { block: ThinkingBlock }) {
  const short = block.content.slice(0, 100);
  return (
    <ThemedBox flexDirection="column">
      <ThemedText dim italic>┌─ Thinking ──────────────────────┐</ThemedText>
      <ThemedText dim italic>│ {short}</ThemedText>
      <ThemedText dim italic>└─────────────────────────────────┘</ThemedText>
    </ThemedBox>
  );
}

// ─── Assistant Message ───

export function AssistantMessage({ blocks }: { blocks: MessageBlock[] }) {
  return (
    <ThemedBox flexDirection="column" gap={0}>
      <ThemedText bold color="brand">Assistant</ThemedText>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text': return <Markdown key={i}>{block.content}</Markdown>;
          case 'tool_use': return <ToolCallView key={i} block={block} />;
          case 'tool_result': return <ToolResultView key={i} block={block} />;
          case 'thinking': return <ThinkingView key={i} block={block} />;
        }
      })}
    </ThemedBox>
  );
}

// ─── User Message ───

export function UserMessage({ content }: { content: string }) {
  return (
    <ThemedBox flexDirection="column">
      <ThemedText bold color="success">You</ThemedText>
      <ThemedText>{content}</ThemedText>
    </ThemedBox>
  );
}

// ─── System Message ───

export function SystemMessage({ content, color }: { content: string; color?: string }) {
  return (
    <ThemedText dim italic color={color}>
      {content}
    </ThemedText>
  );
}

export type { MessageBlock };
