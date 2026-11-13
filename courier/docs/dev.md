# Courier: developer guide

[← Back to README](../README.md) · [User guide](user.md)

## Build

Needs Node, pnpm and Rust (stable).

```bash
cd courier
pnpm install
pnpm tauri dev      # run with hot reload
pnpm tauri build    # .app and .dmg, or the Windows installer
pnpm typecheck      # TypeScript only
```

CI is `../.github/workflows/courier.yml`.

## Code layout

React 19, Vite and Tailwind 3 in `src/`; Rust in `src-tauri/src/`. The UI calls Rust through the typed `commands` object in `src/commands.ts`.

- `src/components/`: reusable UI (Button, Input, Select, Tabs, KeyValueTable, Dialog, CommandPalette, CodeEditor).
- `src/features/`: Sidebar, RequestEditor and its tab editors, ResponsePane, EnvironmentsSheet.
- `src/store.tsx`: state, debounced autosave, send and cancel. `src/tree.ts`: collection lookups.
- `models.rs`: serde types shared with the UI. `sender.rs`: builds and sends requests with reqwest. `substitution.rs`: `{{var}}` resolution.
- `curl.rs`, `codegen.rs`: import and export. `jsonpath.rs`: captures.
- `store.rs`: JSON files with atomic writes and a `.bak.json` copy on a parse failure. `secrets.rs`: keyring vault.
- `ai.rs`: provider requests and streaming for Claude, OpenAI and OpenAI-compatible servers.
- `src/features/ai/`: the assistant panel, agent loop and tools. Read tools run freely; write tools wait for approval.
- `commands.rs`: the Tauri commands; `lib.rs` wires them up.

## How it works

The UI owns the state and saves a snapshot 350 ms after each change. Variables travel with each call as a list (collection first, environment last, so the environment wins) and Rust builds the map. Captures are evaluated in Rust and merged into the active environment by the UI. On save, `secrets.rs` moves secrets into the keyring and strips them from the JSON; if a keyring write fails the secret stays in the file.
