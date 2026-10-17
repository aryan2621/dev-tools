# Wall

**An AI terminal for your Mac. Command blocks, a real editor for input, and an AI that never leaves your machine.**

<!-- DEMO VIDEO: paste the https://github.com/user-attachments/assets/... link on the next line -->

- **Blocks:** every command and its output is its own card, with the folder, git branch, time,
  duration and exit code. Failed commands stand out; long output folds.
- **Input editor:** syntax colors as you type, ghost suggestions from your history, Tab completion
  and multi-line commands.
- **Local AI:** type plain English and get a command with a safety rating, ask why something
  failed (`⌘E`), chat about your output (`⌘L`), or let the agent work through a goal one approved
  step at a time. Runs on a model on your Mac (Qwen3.5, Gemma 4).
- **Wall's window:** click the brick icon in the title bar for Home (today's commands, streak,
  most used), searchable History and Settings, kept out of the terminal.

**[⬇ Download for macOS](https://github.com/aryan2621/dev-tools/releases/latest/download/Wall_0.1.0_aarch64.dmg)**
· macOS 11+ (Apple silicon) · [all downloads](https://github.com/aryan2621/dev-tools/releases/latest)

📖 **[User guide](docs/user.md)** — every feature, setting and shortcut
🛠 **[Developer guide](docs/dev.md)** — build from source, code layout, how it works

## Install

1. Open the `.dmg` and drag **Wall** into **Applications**, then open it.
2. If macOS says **"Apple could not verify Wall is free of malware"**: click **Done**, go to
   **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. (Wall isn't
   signed with a paid Apple certificate; that's the only reason for the warning.)
3. If it says Wall **"is damaged"**, run this once in Terminal and open it again:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Wall.app
   ```

## Quick start

| Do this | What happens |
|---|---|
| Type a command, press **⏎** | It runs and becomes a block |
| Type plain English, press **⏎** | AI suggests a command; **Run**, **Edit** or **Retry** |
| **⌘K** | Ask AI for a single command |
| **⌘E** | Explain the last failed command and suggest a fix |
| **⌘I** | Switch the input: Shell → AI → Agent |
| **⌘D** / **⌘T** | Split the pane / new tab |
| Brick icon or **⌘⇧H** | Open Home, History and Settings |

The first AI request asks you to pick a model: download one in **Settings → AI** (2.7 GB for the
smallest).

## Build from source

```bash
cd wall && npm install && npm run tauri build -- --bundles app
```

Needs Node, Rust and `cmake`. Details in the [developer guide](docs/dev.md).
