/**
 * Dialog and Pane — modal dialog container with title and borders.
 * Ported from Claude Code's Dialog.tsx and Pane.tsx.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ThemedBox, ThemedText } from './themed.js';
import { Divider } from './divider.js';

interface PaneProps {
  children?: React.ReactNode;
  color?: string;
}

export function Pane({ children, color }: PaneProps) {
  return (
    <ThemedBox flexDirection="column" paddingY={1}>
      <Divider color={color} />
      <ThemedBox flexDirection="column" paddingX={2}>
        {children}
      </ThemedBox>
    </ThemedBox>
  );
}

interface DialogProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  color?: string;
  hideBorder?: boolean;
  inputGuide?: string;
}

export function Dialog({ title, subtitle, children, color = 'permission', hideBorder, inputGuide }: DialogProps) {
  const content = (
    <ThemedBox flexDirection="column" gap={1}>
      <ThemedBox flexDirection="column">
        <ThemedText bold color={color}>{title}</ThemedText>
        {subtitle && <ThemedText dim>{subtitle}</ThemedText>}
      </ThemedBox>
      {children}
      {inputGuide && (
        <ThemedBox marginTop={1}>
          <ThemedText dim italic>{inputGuide}</ThemedText>
        </ThemedBox>
      )}
    </ThemedBox>
  );

  if (hideBorder) return content;
  return <Pane color={color}>{content}</Pane>;
}
