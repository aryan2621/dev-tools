import { create } from 'zustand';
import type { Risk } from '../components/RiskBadge';

export type ShellBlock = {
  kind: 'shell';
  id: string;
  command: string;
  cwd: string;
  gitBranch: string | null;
  startedAt: number;
  finishedAt: number | null;
  /** null while the command is still running */
  exitCode: number | null;
  /** colored output, serialized from xterm once the command finished */
  html: string;
  /** plain-text output (ANSI-free) for copy, search and AI context */
  output: string;
  lines: number;
  bookmarked?: boolean;
  collapsed?: boolean;
  explainOpen?: boolean;
};

export type Suggestion = { command: string; explanation: string; risk: Risk };

export type AiBlock = {
  kind: 'ai';
  id: string;
  prompt: string;
  cwd: string;
  startedAt: number;
  status: 'loading' | 'done' | 'error';
  result?: Suggestion;
  error?: string;
};

export type AgentStep = {
  thought: string;
  command: string;
  risk: Risk;
  state: 'proposed' | 'running' | 'ran' | 'skipped';
  exitCode?: number | null;
  output?: string;
};

export type AgentBlock = {
  kind: 'agent';
  id: string;
  goal: string;
  cwd: string;
  startedAt: number;
  status: 'thinking' | 'waiting' | 'running' | 'done' | 'stopped' | 'error';
  steps: AgentStep[];
  summary?: string;
  error?: string;
};

export type Block = ShellBlock | AiBlock | AgentBlock;

export type PaneState = {
  blocks: Block[];
  cwd: string;
  gitBranch: string | null;
  running: boolean;
  mode: 'boot' | 'blocks' | 'classic';
};

type BlocksStore = {
  byPane: Record<number, PaneState>;
  patchPane: (pane: number, patch: Partial<PaneState>) => void;
  addBlock: (pane: number, block: Block) => void;
  patchBlock: <T extends Block>(pane: number, id: string, patch: Partial<T>) => void;
  startShell: (pane: number, command: string) => ShellBlock;
  finishShell: (pane: number, exitCode: number, html: string, output: string, lines: number) => ShellBlock | null;
  clear: (pane: number) => void;
  removePane: (pane: number) => void;
};

const MAX_BLOCKS = 300;
const empty: PaneState = { blocks: [], cwd: '', gitBranch: null, running: false, mode: 'boot' };

export const useBlocks = create<BlocksStore>((set, get) => ({
  byPane: {},
  patchPane: (pane, patch) =>
    set((s) => ({ byPane: { ...s.byPane, [pane]: { ...(s.byPane[pane] ?? empty), ...patch } } })),
  addBlock: (pane, block) =>
    set((s) => {
      const cur = s.byPane[pane] ?? empty;
      return { byPane: { ...s.byPane, [pane]: { ...cur, blocks: [...cur.blocks, block].slice(-MAX_BLOCKS) } } };
    }),
  patchBlock: (pane, id, patch) =>
    set((s) => {
      const cur = s.byPane[pane];
      if (!cur) return s;
      return {
        byPane: {
          ...s.byPane,
          [pane]: { ...cur, blocks: cur.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) },
        },
      };
    }),
  startShell: (pane, command) => {
    const cur = get().byPane[pane] ?? empty;
    const block: ShellBlock = {
      kind: 'shell',
      id: crypto.randomUUID(),
      command,
      cwd: cur.cwd,
      gitBranch: cur.gitBranch,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      html: '',
      output: '',
      lines: 0,
    };
    get().addBlock(pane, block);
    get().patchPane(pane, { running: true });
    return block;
  },
  finishShell: (pane, exitCode, html, output, lines) => {
    const cur = get().byPane[pane];
    if (!cur) return null;
    let done: ShellBlock | null = null;
    const blocks = cur.blocks.slice();
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.kind === 'shell' && b.exitCode === null) {
        done = { ...b, exitCode, html, output, lines, finishedAt: Date.now() };
        blocks[i] = done;
        break;
      }
    }
    set((s) => ({ byPane: { ...s.byPane, [pane]: { ...cur, blocks, running: false } } }));
    return done;
  },
  clear: (pane) =>
    set((s) => {
      const cur = s.byPane[pane];
      if (!cur) return s;
      return { byPane: { ...s.byPane, [pane]: { ...cur, blocks: cur.blocks.filter((b) => b.kind === 'shell' && b.exitCode === null) } } };
    }),
  removePane: (pane) =>
    set((s) => {
      const { [pane]: _gone, ...rest } = s.byPane;
      return { byPane: rest };
    }),
}));

export function shellBlocks(pane: number): ShellBlock[] {
  return (useBlocks.getState().byPane[pane]?.blocks ?? []).filter((b): b is ShellBlock => b.kind === 'shell');
}

/** The last few commands, the shape the AI commands expect as `recent`. */
export function recentCommands(pane: number, n = 3) {
  return shellBlocks(pane)
    .slice(-n)
    .map((b) => ({ command: b.command, exitCode: b.exitCode }));
}

export function lastFailed(pane: number): ShellBlock | null {
  const last = shellBlocks(pane).at(-1);
  return last && last.exitCode !== null && last.exitCode !== 0 && last.exitCode !== 130 ? last : null;
}
