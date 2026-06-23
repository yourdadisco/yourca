/**
 * Divider — horizontal rule with optional centered title.
 * Ported from Claude Code's Divider.tsx.
 */

import React from 'react';
import { Text } from 'ink';
import { useStdout } from 'ink';
import { ThemedText } from './themed.js';

interface DividerProps {
  width?: number;
  color?: string;
  char?: string;
  padding?: number;
  title?: string;
}

export function Divider({ width, color, char = '─', padding = 0, title }: DividerProps) {
  const { stdout } = useStdout();
  const effectiveWidth = Math.max(0, (width ?? stdout.columns) - padding);

  if (title) {
    const titleWidth = title.length + 2;
    const sideWidth = effectiveWidth - titleWidth;
    const left = Math.floor(sideWidth / 2);
    const right = sideWidth - left;
    const line = char.repeat(Math.max(0, left)) + ' ' + title + ' ' + char.repeat(Math.max(0, right));
    return (
      <ThemedText color={color} dim={!color}>
        {line}
      </ThemedText>
    );
  }

  const line = char.repeat(Math.max(0, effectiveWidth));
  return (
    <ThemedText color={color} dim={!color}>
      {line}
    </ThemedText>
  );
}
