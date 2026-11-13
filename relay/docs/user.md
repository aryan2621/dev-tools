# Relay: user guide

[← Back to README](../README.md) · [Developer guide](dev.md)

- [Install](#install) · [Servers](#servers) · [Inspector](#inspector) · [Playground](#playground)
- [Providers](#providers) · [Tests](#tests) · [Activity](#activity) · [Your data](#your-data) · [Troubleshooting](#troubleshooting)

## Install

1. Download [`Relay_0.1.0_aarch64.dmg`](https://github.com/aryan2621/dev-tools/releases/latest/download/Relay_0.1.0_aarch64.dmg)
   (macOS 12 or later, Apple silicon).
2. Open it, drag **Relay** into **Applications**, and open Relay.

**Windows** (10 or later): run [`Relay_0.1.0_x64-setup.exe`](https://github.com/aryan2621/dev-tools/releases/latest/download/Relay_0.1.0_x64-setup.exe).
Secrets go to the Windows Credential Manager instead of the Keychain.

**"Apple could not verify Relay is free of malware":** Relay isn't signed with a paid Apple
Developer certificate, so macOS warns you the first time. Click **Done**, open **System Settings →
Privacy & Security**, scroll down, click **Open Anyway** next to Relay and confirm. If macOS says
Relay **"is damaged and can't be opened"**, run this once in Terminal and open it again:

```bash
xattr -dr com.apple.quarantine /Applications/Relay.app
```

## Servers

Your MCP servers, local and remote. **Try the example server** adds a small built-in one
(`echo` and `add` tools) so you can try everything before connecting your own.

**Add a connection** and choose a transport:

| Transport | You fill in | Example |
|---|---|---|
| **stdio** (local process) | Command, arguments, working folder, environment variables | `npx` · `-y @modelcontextprotocol/server-filesystem ~/Documents` |
| **HTTP** (Streamable HTTP) | URL and headers | `https://example.com/mcp` · `Authorization: Bearer …` |

- Commands are found the way your terminal finds them, so `npx`, `uvx`, `node` and anything from
  Homebrew or nvm work even though Relay was opened from Finder.
- Header and environment variable **values are stored in the macOS Keychain**, never in Relay's
  files. Put credentials in headers, not in the URL.
- Servers that use MCP's OAuth show **Sign in**: your browser opens, you sign in, and Relay keeps
  the tokens in the Keychain and renews them by itself. **Sign out** forgets them.

## Inspector

Pick a connected server to see its **tools**, **resources** and **prompts**.

- A tool shows its description, its input **JSON Schema** and whether it says it's read-only.
- Fill in the **Request arguments** and click **Run tool**. The **Response** shows the
  result, how long it took, and whether the server called it an error.
- Resources can be read and prompts fetched with their arguments the same way.
- **log** (stdio servers) shows the last 4 KB the server printed to stderr: the first place to look
  when it won't start. Servers log there because stdout carries the MCP protocol.
- **Keep this as a test** saves the request to **Tests**, with optional text the response must contain.

## Playground

See how a model uses your tools. Choose a model, choose which tools to share (only the selected
ones are sent), and give it a task.

- Every tool call **waits for your approval**: you see the tool and its arguments, then **Approve & run**
  or **Decline**. Declined calls are reported back to the model. A task stops after 12 rounds of tool calls.
- Tool results, the model's replies and token usage appear step by step.
- Providers are set up on the **Providers** page.

## Providers

Pick a provider, enter its details and press **Load models** to choose from the live list.

- **Claude**, **OpenAI**, **Gemini:** an API key, stored in the system keychain. Requests go
  straight from your computer to that provider.
- **Ollama:** the server URL (default `http://localhost:11434`), no key. Models come from the
  running server.
- **OpenAI-compatible:** a base URL and an optional key.

AI can make mistakes. Check its answers and edits before you rely on them.

## Tests

Saved tool requests. A test passes when the tool doesn't return an error and, if you gave one,
its response contains your expected text. **Run all** after you change your server: each test
connects its server if needed and shows pass or fail. A server that needs
a sign-in asks you to sign in from **Servers** first.

## Activity

Every call made from the Inspector, Playground or Tests: tool and server, status, duration and
time. Open one to see its arguments and response.

## Your data

- Servers, providers and tests: `~/Library/Application Support/com.relay.mcp-workbench/workspace.json`
- Header values, environment variables, API keys and sign-in tokens: the macOS Keychain
  (service `com.relay.mcp-workbench`)

Nothing is sent anywhere except to the MCP servers you connect, the AI provider you choose, and
Hugging Face for model downloads.

## Troubleshooting

- **A stdio server won't connect:** open the Inspector's **log** tab to see its error. Check the command
  runs in Terminal.
- **macOS asks for Keychain access:** click **Always Allow** so it doesn't ask on every request.
- **Ollama is not running:** start it, then press **Load models** on **Providers** again.
