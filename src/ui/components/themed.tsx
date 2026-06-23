/**
 * ThemedBox and ThemedText — theme-key color resolution.
 * Ported from Claude Code's ThemedBox.tsx and ThemedText.tsx.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { FC, ReactNode } from 'react';
import { useTheme, type ThemeColors } from '../theme.js';

type ColorInput = string | undefined;

function resolveColor(color: ColorInput, colors: ThemeColors): string | undefined {
  if (!color) return undefined;
  if (color.startsWith('#') || color.startsWith('rgb')) return color;
  const key = color as keyof ThemeColors;
  return colors[key] ?? color;
}

// ─── ThemedBox (wraps Ink Box, resolves borderColor) ───

export interface ThemedBoxProps {
  children?: ReactNode;
  padding?: number; paddingX?: number; paddingY?: number;
  paddingTop?: number; paddingBottom?: number; paddingLeft?: number; paddingRight?: number;
  margin?: number; marginX?: number; marginY?: number;
  marginTop?: number; marginBottom?: number; marginLeft?: number; marginRight?: number;
  flexDirection?: 'row' | 'column'; gap?: number;
  flexGrow?: number; flexShrink?: number; flexWrap?: 'nowrap' | 'wrap';
  width?: number | string; height?: number | string;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  borderStyle?: 'single' | 'round' | 'bold' | 'double';
  borderColor?: string;
}

export const ThemedBox: FC<ThemedBoxProps> = ({ borderColor, ...rest }) => {
  const { colors } = useTheme();
  const resolvedBorderColor = borderColor ? resolveColor(borderColor, colors) : undefined;
  return <Box borderColor={resolvedBorderColor as any} {...rest as any} />;
};

// ─── ThemedText (wraps Ink Text, resolves color) ───

export interface ThemedTextProps {
  children?: ReactNode;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;   // Maps to dimColor in Ink
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  wrap?: 'wrap' | 'truncate' | 'truncate-end' | 'truncate-middle' | 'truncate-start';
}

export const ThemedText: FC<ThemedTextProps> = ({
  children, color, backgroundColor, bold, dim, italic,
  underline, strikethrough, inverse, wrap,
}) => {
  const { colors } = useTheme();

  let resolvedColor: string | undefined;
  if (color) {
    resolvedColor = resolveColor(color, colors);
  } else if (dim) {
    resolvedColor = colors.dim;
  }

  const resolvedBg = backgroundColor ? resolveColor(backgroundColor, colors) : undefined;

  return (
    <Text
      color={resolvedColor as any}
      backgroundColor={resolvedBg as any}
      bold={bold}
      dimColor={dim}
      italic={italic}
      underline={underline}
      strikethrough={strikethrough}
      inverse={inverse}
      wrap={wrap}
    >
      {children}
    </Text>
  );
};
