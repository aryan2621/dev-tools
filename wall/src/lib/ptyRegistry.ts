import type { ShellBlock } from '../stores/blocks';

/** What a mounted pane exposes to the rest of the app (AI bar, chat, palette, agent). */
export type PaneHandle = {
  /** Runs a command in the pane's shell; resolves when it finishes. */
  run: (command: string) => Promise<ShellBlock | null>;
  /** Puts text in the pane's input editor for the user to review. Never runs it. */
  insert: (text: string) => void;
  focus: () => void;
  /** Sends raw bytes to the running program (e.g. Ctrl-C). */
  write: (data: string) => void;
};

const panes = new Map<number, PaneHandle>();

export function registerPane(id: number, handle: PaneHandle) {
  panes.set(id, handle);
}

export function unregisterPane(id: number) {
  panes.delete(id);
}

export function getPane(id: number): PaneHandle | undefined {
  return panes.get(id);
}

/** Puts `text` in the pane's editor WITHOUT running it, so the user reviews it and presses Enter. */
export async function insertIntoPrompt(paneId: number, text: string) {
  panes.get(paneId)?.insert(text);
}

export function focusTab(paneId: number) {
  panes.get(paneId)?.focus();
}
