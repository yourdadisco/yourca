/**
 * REPL message state
 */
import type { Message } from '../tool/Tool.js';

export let messages: Message[] = [];
export let abortController: AbortController = new AbortController();

export function setMessages(msgs: Message[]): void {
  messages = msgs;
}

export function addMessage(msg: Message): void {
  messages = [...messages, msg];
}

export function resetMessages(): void {
  messages = [];
}

export function newAbortController(): AbortController {
  abortController = new AbortController();
  return abortController;
}
