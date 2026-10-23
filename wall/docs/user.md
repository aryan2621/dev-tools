# Wall: user guide

[← Back to README](../README.md) · [Developer guide](dev.md)

- [Install](#install) · [Blocks](#blocks) · [Running commands](#running-commands) · [Input editor](#input-editor)
- [AI](#ai) · [Tabs and panes](#tabs-and-panes) · [Wall's window](#walls-window-home-history-settings) · [Settings](#settings)
- [Shortcuts](#keyboard-shortcuts) · [Your data](#your-data) · [Troubleshooting](#troubleshooting)

## Install

1. Download [`Wall_0.1.0_aarch64.dmg`](https://github.com/aryan2621/dev-tools/releases/latest/download/Wall_0.1.0_aarch64.dmg)
   (macOS 11 or later, Apple silicon).
2. Open it, drag **Wall** into **Applications**, and open Wall.

**"Apple could not verify Wall is free of malware":** Wall isn't signed with a paid Apple
Developer certificate, so macOS warns you the first time. Click **Done**, open **System Settings →
Privacy & Security**, scroll down, click **Open Anyway** next to Wall and confirm. If macOS says
Wall **"is damaged and can't be opened"**, run this once in Terminal and open it again:

```bash
xattr -dr com.apple.quarantine /Applications/Wall.app
```

Wall uses **zsh** (the macOS default) and loads your own `.zshrc`, so your aliases, `PATH` and
prompt tools keep working.

## Blocks

Every command and its output becomes its own card instead of one endless scroll.

- **Header:** the folder, git branch, start time ("02:19:16 AM · 2m ago"), duration and exit code.
- **Failed commands** get a red rail, a red tint and an exit-code badge.
- **Long output folds** after a set number of lines, with **Show all N lines**. The header stays
  pinned while you scroll a long block.
- **Hover actions:** copy command, copy output, rerun, ask AI about it (attaches it to chat),
  explain & fix. **Right-click** adds bookmark, collapse and copy the whole block.
- **Keyboard:** `⌘↑` / `⌘↓` select the previous / next block, `⌘C` copies it, `⌘F` searches all blocks.
- **Bookmarks** show up in the command palette so you can jump back to them.
- **Colors:** ANSI colors are kept, with a contrast floor so faint colors stay readable in light
  and dark themes.

## Running commands

- **Live view:** a running command streams below the blocks with a spinner, elapsed time and a
  **Stop** button (sends Ctrl-C).
- **Interactive input:** `read`, `sudo`, `ssh` and password prompts take your typing while the
  command runs.
- **Full-screen apps:** `vim`, `htop`, `less` and similar take over the pane and hand it back when
  they exit.
- **Classic fallback:** if the shell doesn't report where commands start and end, the pane switches
  to a plain terminal so nothing breaks.

## Input editor

A real text editor instead of the shell prompt.

- **Context chips** above the input: folder, git branch, mode and clock.
- **Syntax colors** for commands, flags, strings, pipes and variables. Unknown commands show in
  red before you run them.
- **History suggestions** as grey ghost text from your shell history and Wall's own: `→` or `End`
  accepts it, `⌥→` accepts one word.
- **Tab** completes commands, aliases, folders and files in a popover list.
- **`↑` / `↓`** step through history that starts with what you've typed.
- **`⇧⏎`** adds a line; multi-line commands run as one block.
- **Ctrl-C** clears the line, **Esc** resets the mode.
- **Placement:** the input follows your output like a normal terminal, or pin it to the top in
  Settings.

## AI

Everything runs on your Mac through a bundled `llama-server` (llama.cpp with Metal). It starts on
the first AI request. Nothing is sent anywhere.

- **Plain English:** type "find the biggest files in this folder" and Wall sends it to AI instead
  of the shell. The mode chip shows **AI · auto** before you press Enter.
- **AI blocks** show the suggested command, a short explanation and a risk badge (safe / caution /
  danger), with **Run**, **Edit** (puts it in the input) and **Retry**. Anything not rated safe asks
  you to confirm first.
- **Modes:** `⌘I` cycles the input between Shell → AI → Agent. Starting a line with `#` also asks AI.
- **Agent mode:** describe a goal and the agent proposes one command at a time with its reasoning.
  You choose **Run**, **Skip**, **Edit** or **Stop**. It reads each output, picks the next step and
  ends with a summary. Dangerous steps always need a second confirmation. The step limit is
  configurable; auto-running read-only steps is opt-in.
- **Chat (`⌘L`):** a side panel for longer questions with streaming answers. Attach blocks as
  context; commands in replies get **Insert** and **Run**.
- **Explain & fix (`⌘E`):** explains the last failed command under its block and suggests a fix.
- **Quick AI bar (`⌘K`):** a floating prompt for one command suggestion.
- **Autosuggestions (opt-in):** the model completes what you're typing after a short pause.

Wall never runs an AI command on its own: you press **Run** (except agent steps rated safe, if you
turn on auto-run).

**Models** (Settings → AI):

| Model | Size | RAM | Good for |
|---|---|---|---|
| Qwen3.5 4B | 2.7 GB | 8 GB | Quick command suggestions |
| Qwen3.5 9B | 5.7 GB | 16 GB | Tricky commands and error explanations |
| Gemma 4 12B | 6.7 GB | 16 GB | The largest option |

## Tabs and panes

- **Tabs** sit in the title bar, named after the current folder, with a pane count when split.
- **Split:** `⌘D` right, `⌘⇧D` down. Move between panes with `⌘⌥` + arrow keys.
- **Close:** `⌘W` closes a pane, or the tab when one pane is left (it asks first if a command is
  running). Hover a pane and click **×** to close just that one. `⌘⇧W` closes every other pane.
- Each pane runs its own shell; closing a pane shuts that shell down.

## Wall's window: Home, History, Settings

The terminal window stays a terminal. Click the **brick icon** at the right of the title bar (or
press `⌘⇧H`, or `⌘,` for Settings) to open Wall's own window.

- **Home:** today's commands against your daily average with a 7-day chart, your streak and
  success rate, all-time totals, average run time, commands taken from AI, your most-used commands
  and the last few you ran.
- **History:** every command, searchable by command or folder, with a **Failed only** switch.
  Hover a row to copy it or insert it into the terminal (Wall brings the terminal forward).
- **Terminal** in the sidebar jumps back. The card at the bottom shows the AI's status (click it
  for model settings) and the main shortcuts.

## Settings

Open with `⌘,` or **Settings** in Wall's window. Changes apply right away, in every window.

| Section | Options |
|---|---|
| **Appearance** | Theme (system / light / dark), accent (clay, blue, green, purple, pink, amber), interface size, terminal font, font size, line height, compact blocks, welcome screen, input position |
| **Terminal** | Timestamps, durations, lines before folding, cursor style and blink, scrollback, copy on select, history suggestions |
| **AI** | Plain-English detection, autosuggestions, agent step limit, auto-run safe agent steps, models and downloads |
| **Keyboard** | Every shortcut |
| **About** | Version, data folder, clear command history, reset settings |

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
| `⌘C` | Copy the selected block |
| `→` / `End` | Accept the suggestion |
| `⌥→` | Accept one word of the suggestion |
| `Tab` | Complete commands and paths |
| `↑` / `↓` | History (prefix search) |
| `⇧⏎` | New line |
| `⌘⇧H` | Open Wall's window (Home) |
| `⌘,` | Settings |

The **command palette** (`⌘P`) also lists every action, settings toggles, bookmarks and recent
commands.

## Your data

Everything stays in `~/Library/Application Support/app.wall.desktop` (shown in **Settings →
About**):

- `history.db`: the commands you ran in Wall (Home and History read it). **Settings → About →
  Clear** empties it; your shell's own history is untouched.
- `settings.json`: your settings.
- `models/` and `llama-server.log`: downloaded models and the AI server's log.

## Troubleshooting

- **Commands don't become blocks:** block mode needs zsh. With another shell, or if your `.zshrc`
  breaks the integration, the pane falls back to a classic terminal.
- **Plain English went to the shell, or a command went to AI:** detection is a guess. Press `⌘I`
  or `Esc` to pick the mode, or turn detection off in **Settings → AI**.
- **Startup messages from `.zshrc` are missing:** Wall hides greetings and banners printed at
  startup.
- **AI is slow or says no model:** download a model in **Settings → AI**. The first request loads
  it; later ones are quick. Check `llama-server.log` in the data folder if it won't start.
- **Split panes are always 50/50:** resizing isn't supported yet.
