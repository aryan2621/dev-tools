# QueryLab developer guide

## Build

Install on macOS: `pnpm tauri build --bundles app,dmg`, then
`cp -R src-tauri/target/release/bundle/macos/QueryLab.app /Applications/`. Regenerate icons from
`app-icon.svg` with `pnpm tauri icon app-icon.svg` and delete the generated `ios/` and `android/`
folders.

```bash
pnpm install
pnpm tauri dev      # run with hot reload
pnpm typecheck      # TypeScript
cd src-tauri && cargo check
pnpm tauri build    # bundle
```

Needs Node 22, pnpm and Rust.

## Layout

- `src-tauri/src/engine.rs`: the `ENGINES` table. Every engine's name, port, fields, operations,
  input style and CLI tool lives here and is sent to the UI by the `engines` command, so the UI has
  no engine table of its own.
- `src-tauri/src/drivers/`: one file per engine behind the `Driver` trait (`connect`, `disconnect`,
  `run`, `schema`, optional `cancel`). `drivers::make` picks the driver for a profile.
- `src-tauri/src/session.rs`: connected drivers by profile id and cancellable runs. A run races
  the driver against a `Notify`; dropping the future cancels HTTP requests and kills CLI children,
  and drivers with server-side cancel (SQLite, PostgreSQL, MySQL) implement `cancel`.
- `src-tauri/src/process.rs`: CLI discovery, spawning with a timeout and `kill_on_drop`.
- `src-tauri/src/http.rs`, `parsers.rs`: shared HTTP client and CSV/JSON/table result parsing.
- `src-tauri/src/store.rs`, `secrets.rs`: profiles and history as JSON in the app data directory,
  secrets in the OS keyring.
- `src-tauri/src/ai.rs`: provider clients (Claude, OpenAI Responses, Gemini, Ollama, OpenAI-compatible),
  SSE streaming to the `ai-delta` event, one model turn per `ai_step`. The tool loop is in
  TypeScript. Provider keys are in the keyring (`provider:<id>`), settings in `ai.json`.
- `src/features/ai/`: `useAgent.tsx` (loop, approvals), `tools.ts` (QueryLab tools; add a tool by
  adding a `ToolSpec`), `AgentPanel.tsx`, `SettingsSheet.tsx`.
- `src/hooks/useWorkbench.ts`: all UI state and backend calls. `src/components/` holds the
  reusable pieces; `src/lib/gridTheme.ts` builds the grid theme from the CSS tokens.

## Adding an engine

1. Add a variant and an `EngineSpec` row in `engine.rs`.
2. Add `drivers/<name>.rs` implementing `Driver` and register it in `drivers::make`.
3. If it needs a CLI, set `cli_tool` so a missing binary gives a clear install message.

The form, schema panel and editor adapt from the metadata.
