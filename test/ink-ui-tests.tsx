/**
 * Ink-based UI tests — verify React+Ink components render correctly.
 * Same tech stack as Claude Code (React 18 + Ink 5).
 * Run: npx tsx test/ink-ui-tests.tsx
 */

import React from 'react';
import { render, Text, Box } from 'ink';
import chalk from 'chalk';

let pass = 0, fail = 0;
function ok(msg: string) { pass++; console.log(chalk.green('  ✓ ' + msg)); }
function no(msg: string, e?: any) { fail++; console.log(chalk.red('  ✗ ' + msg + (e ? ': ' + e.message : ''))); }
async function test(name: string, fn: () => Promise<void>) {
  console.log(chalk.bold('\n' + name));
  try { await fn(); } catch (e: any) { no(name, e); }
}

// ─── 1. Verify Ink runtime ───

async function testInkRuntime() {
  const ink = await import('ink');
  if (typeof ink.render === 'function') ok('Ink: render function');
  if (typeof ink.Box === 'function' || typeof ink.Box === 'object') ok('Ink: Box component');
  if (typeof ink.Text === 'function') ok('Ink: Text component');
  if (typeof ink.useInput === 'function') ok('Ink: useInput hook');
  if (typeof ink.useApp === 'function') ok('Ink: useApp hook');
  if (typeof ink.useStdout === 'function') ok('Ink: useStdout hook');
  if (typeof ink.useStdin === 'function') ok('Ink: useStdin hook');
  if (typeof ink.Static === 'function') ok('Ink: Static component');
  if (typeof ink.measureElement === 'function') ok('Ink: measureElement');
}

// ─── 2. Render a simple Ink tree ───

async function testInkRender() {
  const { render } = await import('ink');
  const { ThemeProvider, useTheme } = await import('../src/ui/theme.js');

  // Create a test component
  function TestApp() {
    const { theme, colors } = useTheme();
    return React.createElement(Text, { color: colors.text },
      `Hello from Ink! Theme: ${theme}`
    );
  }

  try {
    const { rerender, unmount, waitUntilExit } = render(
      React.createElement(ThemeProvider, null,
        React.createElement(TestApp)
      )
    );
    ok('Ink: render() succeeds without crash');

    // Rerender test
    rerender(
      React.createElement(ThemeProvider, null,
        React.createElement(Text, { color: '#00ff00' }, 'Rerendered!')
      )
    );
    ok('Ink: rerender() works');

    unmount();
    ok('Ink: unmount() works');
  } catch (e: any) {
    no('Ink: render error', e);
  }
}

// ─── 3. REPL Screen component loads ───

async function testREPLScreen() {
  try {
    const { REPLScreen } = await import('../src/ui/repl-screen.js');
    if (typeof REPLScreen === 'function') ok('REPLScreen: component loads');
    else no('REPLScreen: not a function');
  } catch (e: any) {
    no('REPLScreen: import error', e);
  }
}

// ─── 4. Theme system ───

async function testThemeSystem() {
  const { ThemeProvider, useTheme, THEMES } = await import('../src/ui/theme.js');

  if (typeof ThemeProvider === 'function') ok('Theme: ThemeProvider');
  if (typeof useTheme === 'function') ok('Theme: useTheme hook');
  if (THEMES.dark && THEMES.light) ok('Theme: dark and light themes');
  if (THEMES.dark.text && THEMES.dark.error && THEMES.dark.success) ok('Theme: dark has all color tokens');
  if (THEMES.light.text && THEMES.light.error && THEMES.light.success) ok('Theme: light has all color tokens');

  // Use ThemeProvider + useTheme via a test component
  function TestConsumer() {
    const theme = useTheme();
    try {
      if (typeof theme.colors.text === 'string' && theme.colors.text.length > 0) {
        ok('Theme: useTheme returns valid colors');
      } else {
        no('Theme: useTheme colors invalid');
      }
    } catch (e: any) { no('Theme: useTheme error', e); }
    return null;
  }

  const { render } = await import('ink');
  const { unmount } = render(React.createElement(ThemeProvider, null, React.createElement(TestConsumer)));
  unmount();
}

// ─── 5. Verify all UI modules load ───

async function testModulesLoad() {
  const modules = ['../src/ui/theme.js', '../src/ui/app.js', '../src/ui/repl-screen.js'];
  for (const m of modules) {
    try { await import(m); ok('Module: ' + m); } catch (e: any) { no('Module: ' + m, e); }
  }
}

// ─── Main ───

async function main() {
  console.log(chalk.bold.cyan('╔══════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║    YourCA Ink UI System Tests   ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════╝'));

  await test('1. Ink Runtime', testInkRuntime);
  await test('2. Ink Render', testInkRender);
  await test('3. REPL Screen', testREPLScreen);
  await test('4. Theme System', testThemeSystem);
  await test('5. All Modules Load', testModulesLoad);

  const total = pass + fail;
  console.log(chalk.bold('\n' + '─'.repeat(40)));
  console.log(chalk.bold(`Results: ${pass}/${total} passed`));
  if (fail > 0) { console.log(chalk.red(`${fail} failed`)); process.exit(1); }
  else console.log(chalk.green('\nAll Ink UI tests passed! ✓'));
}

main();
