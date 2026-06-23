/**
 * Complete Ink component tests — verify every UI component renders.
 * Run: npx tsx test/ink-components-test.tsx
 */

import React from 'react';
import { render, Text, Box } from 'ink';
import chalk from 'chalk';

let pass = 0, fail = 0;
function ok(m: string) { pass++; console.log(chalk.green('  ✓ ' + m)); }
function no(m: string, e?: any) { fail++; console.log(chalk.red('  ✗ ' + m + (e ? ': ' + e.message : ''))); }

async function test(name: string, fn: () => Promise<void>) {
  console.log(chalk.bold('\n' + name));
  try { await fn(); } catch (e: any) { no(name, e); }
}

function renderAndUnmount(el: React.ReactElement): Promise<void> {
  return new Promise(resolve => {
    try {
      const { unmount } = render(el);
      // Flush by waiting for next tick
      setTimeout(() => { unmount(); resolve(); }, 50);
    } catch (e: any) {
      no('Render error', e);
      resolve();
    }
  });
}

// ─── 1. ThemedText ───

async function testThemedText() {
  const { ThemedText } = await import('../src/ui/components/themed.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ThemedText, { color: 'success', bold: true }, 'Bold Success')
    )
  );
  ok('ThemedText: bold colored text');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ThemedText, { dim: true }, 'Dimmed text')
    )
  );
  ok('ThemedText: dim text');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ThemedText, { color: 'brand' }, 'Brand color')
    )
  );
  ok('ThemedText: theme key color');
}

// ─── 2. ThemedBox ───

async function testThemedBox() {
  const { ThemedBox, ThemedText } = await import('../src/ui/components/themed.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ThemedBox, { flexDirection: 'column', borderColor: 'info' },
        React.createElement(ThemedText, null, 'Box content')
      )
    )
  );
  ok('ThemedBox: with border color');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ThemedBox, { padding: 2 },
        React.createElement(ThemedText, null, 'Padded content')
      )
    )
  );
  ok('ThemedBox: with padding');
}

// ─── 3. Divider ───

async function testDivider() {
  const { Divider } = await import('../src/ui/components/divider.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Divider, null)
    )
  );
  ok('Divider: basic');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Divider, { title: 'Section', color: 'info' })
    )
  );
  ok('Divider: with title');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Divider, { color: 'success' })
    )
  );
  ok('Divider: colored');
}

// ─── 4. ProgressBar ───

async function testProgressBar() {
  const { ProgressBar } = await import('../src/ui/components/progress.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ProgressBar, { ratio: 0.5 })
    )
  );
  ok('ProgressBar: 50%');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ProgressBar, { ratio: 0 })
    )
  );
  ok('ProgressBar: 0%');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ProgressBar, { ratio: 1 })
    )
  );
  ok('ProgressBar: 100%');
}

// ─── 5. Spinner ───

async function testSpinner() {
  const { Spinner } = await import('../src/ui/components/spinner.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Spinner, { type: 'dots', message: 'Loading...' })
    )
  );
  ok('Spinner: dots with message');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Spinner, { type: 'line', color: 'info' })
    )
  );
  ok('Spinner: line type');
}

// ─── 6. Dialog ───

async function testDialog() {
  const { Dialog, Pane } = await import('../src/ui/components/dialog.js');
  const { ThemedText } = await import('../src/ui/components/themed.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Pane, { color: 'info' },
        React.createElement(ThemedText, null, 'Pane content')
      )
    )
  );
  ok('Pane: renders with border');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Dialog, { title: 'Confirm', subtitle: 'Are you sure?', inputGuide: 'Press y/n' })
    )
  );
  ok('Dialog: with title and guide');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Dialog, { title: 'Info', color: 'success' })
    )
  );
  ok('Dialog: colored');
}

// ─── 7. StatusBar ───

async function testStatusBar() {
  const { StatusBar } = await import('../src/ui/components/statusbar.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(StatusBar, {
        left: [{ text: 'Model', color: 'brand' }],
        right: [{ text: '0 tokens', color: 'dim' }],
      })
    )
  );
  ok('StatusBar: left and right');
}

// ─── 8. ListItem ───

async function testListItem() {
  const { ListItem } = await import('../src/ui/components/statusbar.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ListItem, { label: 'Option 1', focused: true })
    )
  );
  ok('ListItem: focused');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ListItem, { label: 'Option 2', selected: true })
    )
  );
  ok('ListItem: selected');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(ListItem, { label: 'Option 3', description: 'This is an option' })
    )
  );
  ok('ListItem: with description');
}

// ─── 9. Markdown ───

async function testMarkdown() {
  const { Markdown } = await import('../src/ui/components/markdown.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Markdown, null, 'Simple text')
    )
  );
  ok('Markdown: simple text');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Markdown, null, '# Heading\n\nParagraph with **bold** and `code`.')
    )
  );
  ok('Markdown: heading and bold');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Markdown, null, '```\ncode block\n```')
    )
  );
  ok('Markdown: code block');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(Markdown, null, '- item 1\n- item 2')
    )
  );
  ok('Markdown: list');
}

// ─── 10. Message components ───

async function testMessages() {
  const { AssistantMessage, UserMessage, SystemMessage } = await import('../src/ui/components/message.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(UserMessage, { content: 'Hello!' })
    )
  );
  ok('UserMessage: renders');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(AssistantMessage, {
        blocks: [
          { type: 'text', content: 'Here is the answer.' },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ]
      })
    )
  );
  ok('AssistantMessage: text + tool call');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(AssistantMessage, {
        blocks: [
          { type: 'text', content: 'Result:' },
          { type: 'tool_result', content: 'file1.txt\nfile2.txt' },
        ]
      })
    )
  );
  ok('AssistantMessage: with result');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(SystemMessage, { content: 'Processing...', color: 'info' })
    )
  );
  ok('SystemMessage: renders');
}

// ─── 11. KeybindingHint ───

async function testKeybindingHint() {
  const { KeybindingHint } = await import('../src/ui/components/statusbar.js');
  const { ThemeProvider } = await import('../src/ui/theme.js');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(KeybindingHint, { shortcut: 'Ctrl+O', action: 'expand' })
    )
  );
  ok('KeybindingHint: basic');

  await renderAndUnmount(
    React.createElement(ThemeProvider, null,
      React.createElement(KeybindingHint, { shortcut: 'Esc', action: 'cancel', parens: true })
    )
  );
  ok('KeybindingHint: with parens');
}

// ─── 12. All Component Modules Load ───

async function testModules() {
  const modules = [
    '../src/ui/theme.js',
    '../src/ui/app.js',
    '../src/ui/components/themed.js',
    '../src/ui/components/divider.js',
    '../src/ui/components/progress.js',
    '../src/ui/components/spinner.js',
    '../src/ui/components/dialog.js',
    '../src/ui/components/statusbar.js',
    '../src/ui/components/markdown.js',
    '../src/ui/components/message.js',
    '../src/ui/components/index.js',
    '../src/ui/repl-screen.js',
  ];
  for (const m of modules) {
    try { await import(m); ok('Module: ' + m.split('/').pop()); }
    catch (e: any) { no('Module: ' + m, e); }
  }
}

// ─── Main ───

async function main() {
  console.log(chalk.bold.cyan('╔══════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   YourCA Complete Ink Component Tests ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════╝'));

  await test('1. ThemedText', testThemedText);
  await test('2. ThemedBox', testThemedBox);
  await test('3. Divider', testDivider);
  await test('4. ProgressBar', testProgressBar);
  await test('5. Spinner', testSpinner);
  await test('6. Dialog & Pane', testDialog);
  await test('7. StatusBar', testStatusBar);
  await test('8. ListItem', testListItem);
  await test('9. Markdown', testMarkdown);
  await test('10. Message Components', testMessages);
  await test('11. KeybindingHint', testKeybindingHint);
  await test('12. All Modules Load', testModules);

  const total = pass + fail;
  console.log(chalk.bold('\n' + '─'.repeat(50)));
  console.log(chalk.bold(`Results: ${pass}/${total} passed`));
  if (fail > 0) { console.log(chalk.red(`${fail} failed`)); process.exit(1); }
  else console.log(chalk.green('\nAll Ink component tests passed! ✓\n'));
}

main();
