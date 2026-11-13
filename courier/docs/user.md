# Courier: user guide

[← Back to README](../README.md) · [Developer guide](dev.md)

## Requests

Pick a method, type a URL and press **Send**. Tabs show a count of what is set:

- **Params** and **Headers**: key-value rows. Untick a row to skip it without deleting it.
- **Auth**: none, bearer token, basic, or an API key sent as a header or query parameter.
- **Body**: none, JSON, raw text, form URL encoded, multipart (text and files), a binary file, or GraphQL.
- **Capture**: save a value from a JSON response into a variable (see below).
- **Settings**: timeout, follow redirects, and allow insecure TLS for self-signed servers.

While a request is running, **Send** becomes **Cancel**.

## Variables and environments

Write `{{name}}` anywhere in a request. Values come from the collection (**⋯ → Variables** on a collection) and the active environment, and the environment wins. A warning lists any name that has no value. Manage environments with **Edit** next to the switcher.

## Capture

In **Capture**, set a variable name and a JSON path such as `data.items.0.id`. After each send the value is written into the active environment, so a login request can feed a token to the next request.

## Responses

The status chip shows the code, with time and size beside it. Switch between **Body**, **Headers** and **Cookies**, between **Pretty** and **Raw**, copy the body, or save it to a file. Images preview inline.

## Import and export

- Paste a `curl` command into the URL field to turn it into a request.
- The code button next to Send copies the request as cURL, JavaScript or Python. Multipart and binary bodies are only included in cURL.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Send | ⌘Enter | Ctrl+Enter |
| New request | ⌘N | Ctrl+N |
| Command palette | ⌘K | Ctrl+K |
| Assistant | ⌘J | Ctrl+J |
| Close tab | ⌘W | Ctrl+W |
| Focus URL | ⌘L | Ctrl+L |

## Assistant

Press **⌘J** to open the assistant. Set a provider first in **AI settings**: Claude, OpenAI, Gemini, Ollama, any OpenAI-compatible server. Replies stream as they are written.

The assistant reads your requests, environments, history and the last response without asking. Anything that changes a request, sets a variable or sends a request is shown as an approval card first. API keys are kept in the system keyring. AI can make mistakes: check its answers and edits before you rely on them.

## Your data

Collections, environments and history are JSON files in the app data folder (macOS: `~/Library/Application Support/com.courier.api-client`; Windows: `%APPDATA%\com.courier.api-client`). Bearer tokens, passwords and API key values are stored in the system keyring and kept out of those files. If the keyring is unavailable, they fall back to the JSON file. History keeps the last 200 requests without secrets.

## Troubleshooting

- **Request failed with a TLS error**: tick **Allow insecure TLS** in the request's Settings.
- **Secrets not saved on Linux**: install a Secret Service provider such as GNOME Keyring.
