/**
 * ProgressBar — Unicode block character progress bar.
 * Ported from Claude Code's ProgressBar.tsx.
 * Uses 8 partial blocks for smooth rendering: ▏▎▍▌▋▊▉█
 */

import React, { useMemo } from 'react';
import { Text } from 'ink';

const BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

interface ProgressBarProps {
  ratio: number;
  width?: number;
  fillColor?: string;
  emptyColor?: string;
}

export function ProgressBar({ ratio, width = 20, fillColor, emptyColor }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const full = Math.floor(clamped * width);
  const partial = Math.round((clamped * width - full) * 8);
  const empty = width - full - (partial > 0 ? 1 : 0);

  const bar = '█'.repeat(full) + (partial > 0 ? BLOCKS[partial] : '') + ' '.repeat(Math.max(0, empty));

  return (
    <Text color={fillColor} backgroundColor={emptyColor}>
      [{bar}] {Math.round(clamped * 100)}%
    </Text>
  );
}
