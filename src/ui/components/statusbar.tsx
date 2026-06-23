/**
 * StatusBar — multi-section status bar, ListItem, KeybindingHint.
 * Ported from Claude Code's StatusBar, ListItem, KeyboardShortcutHint.
 */

import React from 'react';
import { Text } from 'ink';
import { useStdout } from 'ink';
import { ThemedText, ThemedBox } from './themed.js';

// ─── StatusBar ───

interface StatusItem {
  text: string;
  color?: string;
  bold?: boolean;
}

interface StatusBarProps {
  left?: StatusItem[];
  right?: StatusItem[];
  separator?: string;
}

export function StatusBar({ left, right, separator = ' · ' }: StatusBarProps) {
  const { stdout } = useStdout();
  const cols = stdout.columns;

  const leftStr = (left ?? []).map((i, idx) =>
    <ThemedText key={`l${idx}`} color={i.color} bold={i.bold}>{i.text}</ThemedText>
  ).reduce((acc: React.ReactNode[], item, i) =>
    i === 0 ? [item] : [...acc, <ThemedText key={`s${i}`} dim>{separator}</ThemedText>, item]
  , []);

  const rightStr = (right ?? []).map((i, idx) =>
    <ThemedText key={`r${idx}`} color={i.color} bold={i.bold}>{i.text}</ThemedText>
  );

  // Simple flex row via Text wrapping
  return (
    <ThemedText dim>
      {leftStr}{rightStr}
    </ThemedText>
  );
}

// ─── ListItem ───

interface ListItemProps {
  label: string;
  focused?: boolean;
  selected?: boolean;
  disabled?: boolean;
  description?: string;
  indicator?: string;
}

export function ListItem({ label, focused, selected, disabled, description, indicator }: ListItemProps) {
  let ind = indicator ?? ' ';
  if (focused) ind = '❯';
  else if (selected) ind = '✓';

  return (
    <ThemedBox flexDirection="column">
      <ThemedBox flexDirection="row" gap={1}>
        <ThemedText color={focused ? 'info' : selected ? 'success' : undefined} bold={focused}>
          {ind} {label}
        </ThemedText>
      </ThemedBox>
      {description && (
        <ThemedBox paddingLeft={2}>
          <ThemedText dim>{description}</ThemedText>
        </ThemedBox>
      )}
    </ThemedBox>
  );
}

// ─── KeybindingHint ───

interface KeybindingHintProps {
  shortcut: string;
  action: string;
  parens?: boolean;
}

export function KeybindingHint({ shortcut, action, parens }: KeybindingHintProps) {
  const text = (
    <ThemedText dim>
      {parens ? '(' : ''}
      <ThemedText bold>{shortcut}</ThemedText> to {action}
      {parens ? ')' : ''}
    </ThemedText>
  );
  return text;
}

// Re-export ThemedBox
export { ThemedBox } from './themed.js';
