import { create } from 'zustand';
import type { ShellBlock } from './blocks';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; error?: boolean };
export type Attachment = { id: string; label: string; content: string };

type ChatStore = {
  open: boolean;
  messages: ChatMessage[];
  attachments: Attachment[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  attach: (block: ShellBlock) => void;
  detach: (id: string) => void;
  push: (m: ChatMessage) => void;
  patch: (id: string, patch: Partial<ChatMessage>) => void;
  reset: () => void;
};

export const useChat = create<ChatStore>((set) => ({
  open: false,
  messages: [],
  attachments: [],
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  attach: (b) =>
    set((s) => ({
      open: true,
      attachments: s.attachments.some((a) => a.id === b.id)
        ? s.attachments
        : [
            ...s.attachments,
            {
              id: b.id,
              label: b.command,
              content: `$ ${b.command}  [exit ${b.exitCode}] (in ${b.cwd})\n${b.output.slice(-3000)}`,
            },
          ],
    })),
  detach: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patch: (id, patch) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  reset: () => set({ messages: [], attachments: [] }),
}));
