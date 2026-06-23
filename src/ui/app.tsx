/**
 * App component — root wrapper with providers (same pattern as Claude Code's App.tsx)
 */

import React from 'react';
import { ThemeProvider } from './theme.js';

export function App({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, null, children);
}
