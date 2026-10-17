# Wall

An AI terminal for macOS that runs entirely on your Mac. Wall gives you Warp-style command blocks, an editor-like input, and local AI through a bundled llama.cpp server. Nothing leaves your machine.

Built with Tauri 2 (Rust), React, xterm.js, and shadcn/ui with lucide icons.

---

## Features

### Blocks

Every command and its output becomes its own card instead of one endless scroll.

- **Header** shows the folder, git branch, start time ("02:19:16 AM · 2m ago"), duration, and exit code.
- **Failed commands** get a red rail, a red tint, and an exit-code badge.
- **Long output folds** after a set number of lines, with a "Show all N lines" button. The header stays pinned while you scroll a long block.
- **Hover actions:** copy command, copy output, rerun, ask AI about it (attaches it to chat), explain & fix.
- **Right-click menu** has the same actions plus bookmark, collapse, and copy the whole block.
- **Keyboard:**
  - `⌘↑` / `⌘↓` select the previous / next block.
  - `⌘C` copies the selected block.
  - `⌘F` searches across blocks.
- **Bookmarks** show up in the command palette so you can jump back to them.
- **Colored output** keeps its ANSI colors. A contrast floor keeps faint colors readable in light and dark themes.

### Running commands

- **Live view:** a running command streams its output below the blocks, with a spinner, elapsed time, and a **Stop** button (sends Ctrl-C).
- **Interactive input:** prompts like `read`, `sudo`, `ssh` and password requests take keyboard input while the command runs.
- **Full-screen apps:** `vim`, `htop`, `less` and similar take over the whole pane and hand it back when they exit.
- **Classic fallback:** if the shell doesn't report command boundaries, the pane switches to a plain terminal so nothing breaks.

### Input editor

A real text editor instead of the shell prompt.

- **Context chips:** the current folder, git branch, mode and clock sit above the input.
- **Syntax tint:** commands, flags, strings, pipes and variables are colored as you type. Unknown commands show in red before you run them.
- **History suggestions:** grey ghost text from your shell history and Wall's own history.
  - `→` or `End` accepts the whole suggestion.
  - `⌥→` accepts one word.
- **Tab completion** of commands, aliases, folders and files, in a popover list.
- **`↑` / `↓`** step through history that starts with what you've already typed.
- **Multi-line:** `⇧⏎` adds a new line, and multi-line commands run as one block.
- **Ctrl-C** clears the line and **Esc** resets the mode.
- **Placement:** the input follows your output like a normal terminal (top of an empty pane, then under the last block). You can also pin it to the top in Settings.

### AI (fully local)

Wall uses a bundled `llama-server` (llama.cpp, Metal on Apple Silicon). The server starts on the first AI request.

- **Natural-language detection:** type plain English ("find the biggest files in this folder") and Wall sends it to AI instead of the shell. The mode chip shows **AI · auto** before you press Enter.
- **AI blocks:** the answer appears as a card with the suggested command, a short explanation, and a risk badge (safe / caution / danger).
  - It has **Run**, **Edit** (puts it in the input) and **Retry** buttons.
  - Anything not rated safe asks you to confirm before it runs.
- **Input modes:**
  - `⌘I` cycles the input between Shell → AI → Agent.
  - Starting a line with `#` also asks AI.
- **Agent mode:** describe a goal and the agent works step by step.
  - It proposes one command at a time with its reasoning. You choose **Run**, **Skip**, **Edit** or **Stop**.
  - It reads each command's output, decides the next step, and ends with a summary.
  - Dangerous steps always need a second confirmation.
  - The maximum number of steps is configurable. Auto-running read-only steps is opt-in.
- **Chat panel (`⌘L`):** a side panel for longer questions with streaming answers.
  - You can attach blocks as context.
  - Commands in replies get **Insert** and **Run** buttons.
- **Explain & fix (`⌘E`):** explains the last failed command inline under its block and suggests a fix.
- **Quick AI bar (`⌘K`):** a floating prompt for a single command suggestion.
- **AI autosuggestions (opt-in):** the model completes what you're typing after a short pause.
- **Model picker:** choose and download models in Settings → AI. Models LocalBoard already downloaded are reused rather than downloaded again.

| Model | Size | RAM | Notes |
|---|---|---|---|
| Qwen3.5 4B | 2.7 GB | 8 GB | Small and quick; good for command suggestions |
| Qwen3.5 9B | 5.7 GB | 16 GB | Better at tricky commands and error explanations |
| Gemma 4 12B | 6.7 GB | 16 GB | Largest option |

### Tabs and split panes

- **Tabs** live in the title bar and are named after the current folder. They show a pane count when split.
- **Splits:** `⌘D` splits right and `⌘⇧D` splits down.
- **Moving between panes:** `⌘⌥` + arrow keys.
- **Closing:**
  - `⌘W` closes a pane, or the tab when it has one pane left. It asks first if a command is still running.
  - Hover a pane and click its **×** to close just that pane.
  - `⌘⇧W` closes every other pane in the tab.
- **Isolation:** each pane runs its own shell, and closing a pane shuts that shell down.

### Home dashboard (`⌘⇧H`)

A Murmur-style overview of everything you ran in Wall, kept on this Mac.

- **Stats:**
  - commands today and all time
  - success rate
  - average duration
  - AI commands used
  - daily streak
- **14-day activity chart**, with failed commands stacked in red.
- **Most-used commands.**
- **Searchable history:** search by command or folder, filter to failed only. Each row can be copied or inserted into the terminal.
- **Persistence:** history is stored in SQLite and survives restarts.

### Settings (`⌘,`)

| Section | Options |
|---|---|
| **Appearance** | Theme (system / light / dark), accent color (terracotta, blue, green, purple, pink, amber), interface size, terminal font, font size, line height, compact blocks, welcome screen on/off, input position |
| **Terminal** | Show timestamps, show duration, lines before folding, cursor style and blink, scrollback, copy on select, history suggestions |
| **AI** | Natural-language detection, AI autosuggestions, agent max steps, auto-run safe agent steps, model picker and downloads |
| **Keyboard** | Full shortcut cheat sheet |
| **About** | Version, data folder, clear command history, reset settings |

Settings apply immediately and are saved to `settings.json` in the app data folder.

### Everything else

- **Command palette (`⌘P`)** collects all actions, settings toggles, bookmarks and recent commands in one searchable list.
- **Welcome screen** shows tips and recent folders in an empty pane. You can turn it off with "Don't show this again" or in Settings.
- **Toasts** confirm copies.
- **LocalBoard look:** Inter and JetBrains Mono, warm neutrals, light and dark themes.
- **Window chrome:** the native macOS title bar is replaced by an overlay title bar with the tabs in it.

---

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘T` | New tab |
| `⌘W` | Close pane / tab |
| `⌘⇧W` | Close all other panes |
| `⌘1` … `⌘9` | Switch tab |
| `⌘D` / `⌘⇧D` | Split right / down |
| `⌘⌥ ← → ↑ ↓` | Move between panes |
| `⌘K` | Ask AI for a command |
| `⌘I` | Cycle input mode: Shell → AI → Agent |
| `#` … | Ask AI from the input |
| `⌘L` | AI chat panel |
| `⌘E` | Explain the last failed command |
| `⌘P` | Command palette |
| `⌘F` | Find in blocks |
| `⌘↑` / `⌘↓` | Select previous / next block |
| `⌘C` | Copy selected block |
| `→` / `End` | Accept suggestion |
| `⌥→` | Accept one word of the suggestion |
| `Tab` | Complete commands and paths |
| `↑` / `↓` | History (prefix search) |
| `⇧⏎` | New line |
| `⌘,` | Settings |
| `⌘⇧H` | Home |

---

## Running it

Requirements: macOS, Node 18+, Rust (stable), and Xcode command-line tools.

```bash
npm install
./scripts/build-llama-server.sh   # one-time: builds the bundled llama-server sidecar
npm run tauri dev                 # run in development
npm run tauri build               # build a .app / .dmg
```

On first use of an AI feature, pick or download a model in **Settings → AI**.

### How it works

- **Blocks:** Wall starts zsh with a small integration script (`src-tauri/shell/.zshrc`) that loads your own `.zshrc` and then emits OSC 133 / OSC 7 markers for prompt start, command start, command end with exit code, and the current folder.
  - Wall splits the terminal stream on those markers.
  - A finished block's output is turned into static HTML, so old blocks cost nothing to keep around.
  - The shell's own prompt is hidden; Wall draws its own input.
- **AI:** requests go to the local `llama-server` on `127.0.0.1`.
  - Suggestions are checked by a rule-based safety pass (`src-tauri/src/safety.rs`) that sets the risk level.
  - AI output is never run without your action, except agent steps rated safe when you turn on auto-run.
- **Data:** history (`history.db`), settings, models and logs live in the app data folder, shown in Settings → About.

### Project layout

```
src/
  components/terminal/   Pane (PTY + blocks), BlockCard, InputEditor, AI/Agent blocks
  components/ai/         Chat panel
  components/layout/     Title bar, sidebar
  pages/                 Terminal, Home, Settings
  stores/                zustand stores: blocks, workspace, settings, chat, llm
src-tauri/src/
  pty.rs                 shell processes
  ai.rs                  suggest, explain, chat, agent steps
  history.rs             SQLite history and stats
  shell.rs               git info, completion, known commands, settings file
  safety.rs              command risk assessment
  llm/                   llama-server lifecycle, model catalog and downloads
```

### Limitations

- Block mode needs **zsh**. Other shells use the classic terminal view.
- Natural-language detection is a heuristic and can misfire. Use `⌘I` or `Esc` to switch modes.
- Startup output printed by your `.zshrc` (greetings, banners) is hidden.
- Split panes are always 50/50 and can't be resized yet.
