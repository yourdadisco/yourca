/**
 * Spinner — animated loading indicator using Ink.
 * Ported from Claude Code's Spinner system.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';

const FRAMES: Record<string, string[]> = {
  dots: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.split(''),
  line: '─━═╾╴╶╾═━─'.split(''),
  arrow: '→↘↓↙←↖↑↗'.split(''),
  pulse: '⣀⣄⣤⣦⣶⣷⣿⣷⣶⣦⣤⣄'.split(''),
  clock: '🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛'.split(''),
};

interface SpinnerProps {
  type?: keyof typeof FRAMES;
  message?: string;
  color?: string;
}

export function Spinner({ type = 'dots', message, color }: SpinnerProps) {
  const [frame, setFrame] = useState(0);
  const frames = FRAMES[type] ?? FRAMES.dots;
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 80);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [frames.length]);

  const spinner = frames[frame];
  return (
    <Text color={color}>
      {spinner}{message ? ` ${message}` : ''}
    </Text>
  );
}
