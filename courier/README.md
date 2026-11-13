# Courier

**A fast, native HTTP client. Build requests, organise them in collections, switch environments and copy any request as code.**

- **Send** GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS with params, headers, bearer, basic and API-key auth, and JSON, text, form, multipart, binary or GraphQL bodies.
- **Variables**: `{{name}}` works in the URL, headers and body, from collection variables and environments, with a warning for any that are unresolved.
- **Capture** values from a JSON response into the active environment, so the next request can use them.
- **Import** by pasting a `curl` command into the URL field.
- **AI assistant** (⌘J): explain responses, debug errors and draft requests with Claude, OpenAI, Gemini, Ollama, or any compatible server. Edits and sends always wait for your approval.
- **Copy as code** for cURL, JavaScript and Python.
- **Private**: auth secrets live in the system keyring, and everything else is plain JSON in the app data folder.

**[⬇ Download for macOS](https://github.com/aryan2621/dev-tools/releases/latest/download/Courier_0.1.0_aarch64.dmg)**
· [Windows](https://github.com/aryan2621/dev-tools/releases/latest/download/Courier_0.1.0_x64-setup.exe)
· macOS 12+ (Apple silicon), Windows 10+ · [all downloads](https://github.com/aryan2621/dev-tools/releases/latest)

📖 **[User guide](docs/user.md)**: requests, variables, capture, import, shortcuts
🛠 **[Developer guide](docs/dev.md)**: build from source, code layout, how it works

## Install

**macOS**

1. Open the `.dmg` and drag **Courier** into **Applications**, then open it.
2. If macOS says **"Apple could not verify Courier is free of malware"**: click **Done**, go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. (Courier isn't signed with a paid Apple certificate.)
3. If it says Courier **"is damaged"**, run this once in Terminal and open it again:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Courier.app
   ```

**Windows**

Run `Courier_0.1.0_x64-setup.exe`. If SmartScreen says it **protected your PC**, click **More info → Run anyway**.

## Quick start

1. Pick a request in the **Examples** collection, or press **⌘N** (Ctrl+N) for a new one.
2. Press **⌘Enter** (Ctrl+Enter) to send. Press **⌘K** (Ctrl+K) for every command.
3. Choose **JSONPlaceholder** in the environment switcher at the bottom of the sidebar to resolve `{{baseUrl}}`.

## Build from source

```bash
cd courier && pnpm install && pnpm tauri build
```

Needs Node, pnpm and Rust. Details in the [developer guide](docs/dev.md).
