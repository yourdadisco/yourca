import type { Message, Content } from '../tool/Tool.js';

export function createUserMessage(text: string): Message {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
  };
}

export function createAssistantMessage(content: Content[]): Message {
  return {
    role: 'assistant',
    content,
  };
}

export function createSystemMessage(text: string): Message {
  return {
    role: 'user',
    content: [{ type: 'text', text: `<system>\n${text}\n</system>` }],
  };
}

export function countToolCalls(messages: Message[]): number {
  return messages.reduce((count, msg) => {
    if (msg.role === 'assistant') {
      return count + msg.content.filter((c): c is Content & { type: 'tool_use' } => c.type === 'tool_use').length;
    }
    return count;
  }, 0);
}

export function countTotalTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => {
    for (const c of msg.content) {
      if (c.type === 'text') total += countTotalTokens(c.text);
    }
    return total;
  }, 0);
}
