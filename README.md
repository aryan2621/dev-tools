# Dev tools

[![M8ven Score](https://m8ven.ai/badge/mcp/aryan2621-desktop-apps-n5novw?v=64ca7b4b42122f9817a437371bf773bb)](https://m8ven.ai/mcp/aryan2621-desktop-apps-n5novw?s=readme)

**Small desktop tools for developers. Everything runs on your computer.**

| | | |
|---|---|---|
| **[BigView](bigview/)** | Open and edit CSV, JSON and Excel files of any size: gigabyte files open in seconds. Sort, filter, column stats, find and replace, export. | [⬇ macOS](https://github.com/aryan2621/dev-tools/releases/latest/download/BigView_0.1.0_aarch64.dmg) · [Windows](https://github.com/aryan2621/dev-tools/releases/latest/download/BigView_0.1.0_x64-setup.exe) |
| **[Relay](relay/)** | A workbench for MCP developers: connect a server, call its tools, save tests, and watch an AI use them, with your approval for every call. | [⬇ macOS](https://github.com/aryan2621/dev-tools/releases/latest/download/Relay_0.1.0_aarch64.dmg) · [Windows](https://github.com/aryan2621/dev-tools/releases/latest/download/Relay_0.1.0_x64-setup.exe) |
| **[Wall](wall/)** | An AI terminal with Warp-style command blocks, an editor-like input, and a local AI that suggests, explains and runs commands. Nothing leaves your Mac. | [⬇ macOS](https://github.com/aryan2621/dev-tools/releases/latest/download/Wall_0.1.0_aarch64.dmg) |

[All downloads](https://github.com/aryan2621/dev-tools/releases/latest) · each app's page has a
user guide and a developer guide.

> **Murmur** (dictation and voice assistant) and **Capturita** (screen recorder and editor) used to
> live here and now have their own repos: [aryan2621/murmur](https://github.com/aryan2621/murmur) ·
> [aryan2621/capturita](https://github.com/aryan2621/capturita). Older releases here still carry
> their installers.

## Requirements

| | macOS | Windows | Notes |
|---|---|---|---|
| BigView | 10.13+ | 10+ | Apple silicon build for macOS. |
| Relay | 12+ | 10+ | Apple silicon build for macOS. On-device models 2.7–16.5 GB, optional (or use your Claude, OpenAI or Gemini key). |
| Wall | 11+ | – | Apple silicon, macOS only (needs zsh for command blocks). On-device models optional. |

## Privacy

- Everything runs on your computer. Nothing is uploaded unless you ask (a cloud AI key you add in
  Relay).
- No analytics or tracking.

## Build from source

Each app's developer guide has the details. In short:

```bash
cd bigview   && npm install  && npm run tauri dev
cd relay     && pnpm install && pnpm tauri dev        # needs cmake
cd wall      && npm install  && npm run tauri dev        # needs cmake; macOS only
```

Each app has its own workflow in the **Actions** tab (BigView, Relay, Wall): every push that
changes an app builds its macOS and Windows installers (download them from the run's
**Artifacts**). Tagging `v*` builds them all and publishes one release.
