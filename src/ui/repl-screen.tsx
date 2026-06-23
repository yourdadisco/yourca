/**
 * REPL screen — Ink display + readline input (reliable hybrid approach).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useStdout, useApp } from 'ink';
import { useTheme } from './theme.js';
import type { Tool, ToolPermissionContext } from '../tool/Tool.js';
import type { Message } from '../tool/Tool.js';
import { createDefaultPermissionContext } from '../tool/permissions.js';
import { runQuery, type QueryEvent } from '../query/QueryEngine.js';
import { createUserMessage } from '../query/messages.js';
import { getSessionId, getMainLoopModel, getTotalCostUSD, getTotalInputTokens, getTotalOutputTokens, getTotalAPIDuration } from '../state/bootstrap.js';
import * as replState from '../repl/state.js';

export interface REPLScreenProps {
  tools: readonly Tool[];
  systemPrompt: string;
  permissionContext?: ToolPermissionContext;
  onDone?: () => void;
}

interface Msg {
  role: 'user' | 'assistant' | 'system';
  text: string;
  isStreaming?: boolean;
}

export function REPLScreen({ tools, systemPrompt, permissionContext, onDone }: REPLScreenProps) {
  const { colors } = useTheme();
  const { stdout } = useStdout();
  const { exit } = useApp();
  const ctx = permissionContext ?? createDefaultPermissionContext();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'input' | 'running'>('input');
  const [cost, setCost] = useState('$0.00');
  const abortRef = useRef(new AbortController());
  const inputRef = useRef<readline.Interface | null>(null);
  const stdinBuffer = useRef('');

  // Setup readline for input
  useEffect(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: '',
    });

    rl.on('line', (line: string) => {
      if (mode !== 'input') return;
      const text = line.trim();
      if (!text) { rl.prompt(); return; }

      if (text === '/exit' || text === '/quit') {
        rl.close();
        onDone?.();
        exit?.();
        return;
      }

      setMsgs(prev => [...prev, { role: 'user', text }]);
      setMode('running');
      runQueryAsync(text);
    });

    rl.on('SIGINT', () => {
      if (abortRef.current.signal.aborted) {
        rl.close();
        onDone?.();
        exit?.();
      } else {
        abortRef.current.abort();
        setMode('input');
        setMsgs(prev => [...prev, { role: 'system', text: '⏹ Interrupted' }]);
      }
    });

    inputRef.current = rl;
    rl.prompt();
    process.stdin.setRawMode?.(false); // Ensure cooked mode

    return () => {
      rl.close();
    };
  }, [mode]);

  // Update cost periodically
  useEffect(() => {
    const iv = setInterval(() => {
      setCost('$' + getTotalCostUSD().toFixed(4));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const runQueryAsync = useCallback(async (prompt: string) => {
    abortRef.current = new AbortController();
    const msgsList: Message[] = [...replState.messages, createUserMessage(prompt)];
    replState.addMessage(createUserMessage(prompt));

    let textAccum = '';

    try {
      const result = await runQuery({
        messages: msgsList,
        systemPrompt,
        tools: tools as any,
        maxTurns: 25,
        abortController: abortRef.current,
        permissionContext: ctx,
        onEvent: (event: QueryEvent) => {
          if (event.type === 'text') {
            textAccum += event.text;
            setMsgs(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant' && last.isStreaming) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: textAccum, isStreaming: true };
                return updated;
              }
              return [...prev, { role: 'assistant', text: textAccum, isStreaming: true }];
            });
          } else if (event.type === 'tool_start') {
            const preview = JSON.stringify(event.input).slice(0, 60);
            setMsgs(prev => [...prev, { role: 'system', text: `🔧 ${event.name}(${preview}…)` }]);
          } else if (event.type === 'tool_result_text') {
            const line1 = event.result?.split('\n')[0].slice(0, 50) || '';
            if (line1) setMsgs(prev => [...prev, { role: 'system', text: `  → ${line1}` }]);
          } else if (event.type === 'error') {
            setMsgs(prev => [...prev, { role: 'system', text: `⚠ ${event.message}` }]);
          }
        },
      });

      replState.setMessages(result);
      setMsgs(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i]?.isStreaming) { updated[i] = { ...updated[i], isStreaming: false }; break; }
        }
        return updated;
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') setMsgs(prev => [...prev, { role: 'system', text: `Error: ${err.message}` }]);
    }

    setMode('input');
    inputRef.current?.prompt();
  }, [systemPrompt, tools, ctx]);

  // UI Render
  const cols = stdout.columns ?? 80;
  const running = mode === 'running';

  return React.createElement(Box, { flexDirection: 'column' },
    // Header
    React.createElement(Box, { marginTop: 1, marginLeft: 1 },
      React.createElement(Text, { color: colors.brand, bold: true }, 'YourCA'),
      React.createElement(Text, { color: colors.dim }, ' v0.1.0  '),
      React.createElement(Text, { color: colors.text }, getMainLoopModel()),
      React.createElement(Text, { color: colors.dim }, '  │ ' + getSessionId().slice(0, 8) + '…'),
    ),

    // Help hint
    React.createElement(Box, { marginLeft: 1, marginBottom: 1 },
      React.createElement(Text, { color: colors.dim }, '/help  │  Esc to interrupt  │  Ctrl+D to exit'),
    ),

    // Separator
    React.createElement(Text, { color: colors.dim }, '─'.repeat(cols)),

    // Messages area
    React.createElement(Box, { flexDirection: 'column', marginLeft: 1, marginRight: 1, marginTop: 1, marginBottom: 1 },
      msgs.map((m, i) => {
        if (m.role === 'user') {
          return React.createElement(Box, { key: i },
            React.createElement(Text, { color: colors.success, bold: true }, '❯ '),
            React.createElement(Text, { color: colors.text }, m.text),
          );
        }
        if (m.role === 'system') {
          return React.createElement(Text, { key: i, color: colors.dim, italic: true }, m.text);
        }
        // Assistant message
        return React.createElement(Box, { key: i, flexDirection: 'column' },
          React.createElement(Text, { color: colors.text }, m.isStreaming ? m.text + React.createElement(Text, { color: colors.info }, '●') : m.text),
        );
      }),
    ),

    // Input prompt (footer)
    React.createElement(Box, { marginTop: 1, marginLeft: 1 },
      running
        ? React.createElement(Text, { color: colors.info }, '● Processing...')
        : React.createElement(Box, null,
            React.createElement(Text, { color: colors.brand, bold: true }, '❯ '),
            React.createElement(Text, { color: colors.text }, ' '),
          ),
    ),
  );
}

// ─── Entry point ───
import { render } from 'ink';
import * as readline from 'readline';
import { getEnabledTools } from '../tool/tools.js';
import { initAPI } from '../query/api.js';
import { regenerateSessionId, setMainLoopModel } from '../state/bootstrap.js';
import { requireApiKey } from '../utils/config.js';
import { buildSystemPrompt, getSystemContext, getUserContext } from '../context/context.js';
import { App } from './app.js';

export async function startInkREPL(): Promise<void> {
  const tools = getEnabledTools();
  regenerateSessionId();
  const apiKey = requireApiKey();
  initAPI({ apiKey });
  if (process.env.YOURCA_MODEL) setMainLoopModel(process.env.YOURCA_MODEL);
  const [sysCtx, userCtx] = await Promise.all([getSystemContext(), getUserContext()]);
  const systemPrompt = buildSystemPrompt(sysCtx, userCtx);

  // Create a pass-through stdin that tells Ink it's a TTY
  const PassThrough = (await import('stream')).PassThrough;
  const mockStdin = new PassThrough();
  (mockStdin as any).isTTY = true;

  const { unmount } = render(
    React.createElement(App, null,
      React.createElement(REPLScreen, {
        tools: tools as Tool[],
        systemPrompt,
      })
    ),
    {
      stdin: mockStdin as any,
      stdout: process.stdout as any,
      stderr: process.stderr as any,
      exitOnCtrlC: false,
      patchConsole: false,
    }
  );

  // Wait for exit signal
  await new Promise<void>(resolve => {
    process.on('SIGINT', () => {
      unmount();
      resolve();
    });
    process.on('SIGTERM', () => {
      unmount();
      resolve();
    });
  });
}
