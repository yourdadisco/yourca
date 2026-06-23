/**
 * Markdown renderer — renders markdown as Ink components.
 * Ported from Claude Code's Markdown.tsx approach.
 * Parses markdown → renders inline styled Text and Box components.
 */

import React, { useMemo } from 'react';
import { Text } from 'ink';
import { ThemedText, ThemedBox } from './themed.js';

interface MarkdownProps {
  children: string;
  dimColor?: boolean;
}

// ─── Inline style processing ───

function renderInline(text: string, dimColor?: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;

  // Match patterns in order: code, bold+italic, bold, italic, strikethrough, link
  const patterns: Array<{ regex: RegExp; render: (match: string[]) => React.ReactNode }> = [
    { regex: /`([^`]+)`/, render: ([_, c]) => <ThemedText key={parts.length} dim backgroundColor={dimColor ? undefined : '#333'}>{c}</ThemedText> },
    { regex: /\*\*\*(.+?)\*\*\*/, render: ([_, t]) => <ThemedText key={parts.length} bold italic>{t}</ThemedText> },
    { regex: /\*\*(.+?)\*\*/, render: ([_, t]) => <ThemedText key={parts.length} bold>{t}</ThemedText> },
    { regex: /__(.+?)__/, render: ([_, t]) => <ThemedText key={parts.length} bold>{t}</ThemedText> },
    { regex: /\*(.+?)\*/, render: ([_, t]) => <ThemedText key={parts.length} italic>{t}</ThemedText> },
    { regex: /_(.+?)_/, render: ([_, t]) => <ThemedText key={parts.length} italic>{t}</ThemedText> },
    { regex: /~~(.+?)~~/, render: ([_, t]) => <ThemedText key={parts.length} strikethrough>{t}</ThemedText> },
    { regex: /\[([^\]]+)\]\(([^)]+)\)/, render: ([_, t, u]) =>
      <ThemedText key={parts.length} underline>{t}</ThemedText>
    },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, render } of patterns) {
      const match = remaining.match(regex);
      if (match && match.index !== undefined) {
        // Text before match
        if (match.index > 0) {
          parts.push(<ThemedText key={parts.length} dim={dimColor}>{remaining.slice(0, match.index)}</ThemedText>);
        }
        // Matched element
        parts.push(render(match));
        remaining = remaining.slice(match.index + match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      parts.push(<ThemedText key={parts.length} dim={dimColor}>{remaining}</ThemedText>);
      break;
    }
  }

  return parts;
}

// ─── Code block renderer ───

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const lines = code.split('\n');
  return (
    <ThemedBox flexDirection="column">
      {lang && <ThemedText dim>┌─ {lang}</ThemedText>}
      {lines.map((line, i) => (
        <ThemedText key={i} dim>│ {line}</ThemedText>
      ))}
      <ThemedText dim>└{'─'.repeat(20)}</ThemedText>
    </ThemedBox>
  );
}

// ─── Main Markdown component ───

export function Markdown({ children, dimColor }: MarkdownProps) {
  const lines = children.split('\n');

  const elements = useMemo(() => {
    const result: React.ReactNode[] = [];
    let inCode = false;
    let codeLang = '';
    const codeBuf: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code block fence
      if (trimmed.startsWith('```')) {
        if (inCode) {
          result.push(<CodeBlock key={`cb${i}`} code={codeBuf.join('\n')} lang={codeLang} />);
          codeBuf.length = 0;
          inCode = false;
          codeLang = '';
        } else {
          inCode = true;
          codeLang = trimmed.slice(3).trim();
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      // Empty line
      if (!trimmed) { result.push(<ThemedText key={`e${i}`}> </ThemedText>); continue; }

      // Heading
      const hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
      if (hMatch) {
        const level = hMatch[1].length;
        const text = hMatch[2];
        if (level <= 2) result.push(<ThemedText key={`h${i}`} bold underline={level === 1}>{text}</ThemedText>);
        else if (level === 3) result.push(<ThemedText key={`h${i}`} bold>{text}</ThemedText>);
        else result.push(<ThemedText key={`h${i}`} dim italic>{text}</ThemedText>);
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        result.push(<ThemedText key={`bq${i}`} dim>  {renderInline(trimmed.slice(2), dimColor)}</ThemedText>);
        continue;
      }

      // List item
      const ulMatch = trimmed.match(/^[-*+]\s+(.*)/);
      if (ulMatch) {
        result.push(<ThemedText key={`ul${i}`} dim={dimColor}> • {renderInline(ulMatch[1], dimColor)}</ThemedText>);
        continue;
      }

      // Regular paragraph
      result.push(<ThemedText key={`p${i}`} dim={dimColor}>{renderInline(line, dimColor)}</ThemedText>);
    }

    // Handle unclosed code block
    if (inCode && codeBuf.length > 0) {
      result.push(<CodeBlock code={codeBuf.join('\n')} lang={codeLang} />);
    }

    return result;
  }, [children, dimColor]);

  return <ThemedBox flexDirection="column" gap={0}>{elements}</ThemedBox>;
}

// Re-export ThemedBox for convenience
export { ThemedBox } from './themed.js';
