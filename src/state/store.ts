/**
 * Generic publish-subscribe store — inspired by Claude Code's store.ts
 */
export type Listener = () => void;
export type Unsubscribe = () => void;

export interface Store<T> {
  getState(): T;
  setState(updater: (prev: T) => T): void;
  subscribe(listener: Listener): Unsubscribe;
}

export function createStore<T>(
  initialState: T,
  onChange?: (args: { newState: T; oldState: T }) => void,
): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (updater) => {
      const oldState = state;
      const newState = updater(state);
      if (Object.is(newState, oldState)) return;
      state = newState;
      onChange?.({ newState, oldState });
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
