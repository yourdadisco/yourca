/**
 * Theme system using React context — ported from Claude Code's ThemeProvider.
 * Same tech stack: React + Ink context pattern.
 */

import React, { createContext, useContext, useState, useMemo } from 'react';

export type ThemeName = 'dark' | 'light';

export interface ThemeColors {
  text: string;          // Main text
  dim: string;           // Dimmed/inactive text
  error: string;         // Error messages
  success: string;       // Success messages
  warning: string;       // Warning messages
  info: string;          // Info/accent
  brand: string;         // Brand color (claude amber)
  subtle: string;        // Subtle text
  permission: string;    // Permission dialog color
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  dark: {
    text: '#dcdcdc', dim: '#787882', error: '#dc5050', success: '#64c864',
    warning: '#dcb43c', info: '#64a0dc', brand: '#d79650', subtle: '#9696a0',
    permission: '#dca03c',
  },
  light: {
    text: '#282828', dim: '#96969b', error: '#c82828', success: '#28a028',
    warning: '#c8a014', info: '#2864b4', brand: '#b47832', subtle: '#787882',
    permission: '#c88c14',
  },
};

interface ThemeCtx {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'dark', colors: THEMES.dark, setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const value = useMemo(() => ({ theme, colors: THEMES[theme], setTheme }), [theme]);
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext);
}
