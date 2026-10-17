use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use futures_util::future::{abortable, AbortHandle};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use crate::llm::provider::{ChatMessage, ChatRequest, LlmProvider, ResponseFormat, Role};
use crate::llm::LlmRuntime;
use crate::safety::{self, Risk};

#[derive(Default)]
pub struct AiState {
    inflight: Mutex<HashMap<String, AbortHandle>>,
    /// Model chosen in Settings; `None` uses the smallest installed one.
    pub model: Mutex<Option<String>>,
}

impl AiState {
    pub fn preferred(&self) -> Option<String> {
        self.model.lock().ok().and_then(|m| m.clone())
    }
}

#[tauri::command]
pub fn ai_set_model(ai: State<'_, AiState>, model_id: Option<String>) {
    if let Ok(mut model) = ai.model.lock() {
        *model = model_id;
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCmd {
    pub command: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Suggestion {
    pub command: String,
    pub explanation: String,
    #[serde(default = "default_risk")]
    pub risk: Risk,
}

fn default_risk() -> Risk {
    Risk::Caution
}

const SUGGEST_SYSTEM: &str = "You turn a request into ONE shell command for the user's terminal. \
Reply with JSON: {\"command\", \"explanation\", \"risk\"}. \
`command` is a single line (chain with && or pipes if needed), no markdown, no placeholders unless unavoidable. \
`explanation` is one short sentence. \
`risk` is \"safe\" (read-only), \"caution\" (changes or deletes files, installs software, force-pushes) or \"danger\" \
(system-wide or irreversible damage, privilege escalation, piping downloads into a shell). \
Use flags that work on the user's OS; on macOS prefer BSD-compatible flags.";

fn suggestion_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "command": { "type": "string" },
            "explanation": { "type": "string" },
            "risk": { "type": "string", "enum": ["safe", "caution", "danger"] }
        },
        "required": ["command", "explanation", "risk"],
        "additionalProperties": false
    })
}

fn list_dir(cwd: &Path) -> String {
    let Ok(entries) = std::fs::read_dir(cwd) else { return String::new() };
    let mut names: Vec<String> = entries
        .flatten()
        .map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if e.file_type().is_ok_and(|t| t.is_dir()) { format!("{name}/") } else { name }
        })
        .collect();
    names.sort();
    let total = names.len();
    names.truncate(60);
    let mut out = names.join("  ");
    if total > 60 {
        out.push_str(&format!("  … (+{} more)", total - 60));
    }
    out
}

fn environment_context(cwd: Option<&str>, recent: &[RecentCmd]) -> String {
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell = shell.rsplit('/').next().unwrap_or("zsh");
    let mut out = format!("OS: {}\nShell: {shell}\n", std::env::consts::OS);
    if let Some(cwd) = cwd.filter(|c| !c.is_empty()) {
        out.push_str(&format!("Current directory: {cwd}\n"));
        if let Some(branch) = crate::shell::git_branch(Path::new(cwd)) {
            out.push_str(&format!("Git branch: {branch}\n"));
        }
        let listing = list_dir(Path::new(cwd));
        if !listing.is_empty() {
            out.push_str(&format!("Files here: {listing}\n"));
        }
    }
    if !recent.is_empty() {
        out.push_str("Recent commands (oldest first):\n");
        for r in recent.iter().rev().take(3).rev() {
            let status = r.exit_code.map_or("running".to_owned(), |c| format!("exit {c}"));
            out.push_str(&format!("  $ {}  [{status}]\n", r.command));
        }
    }
    out
}

fn emit(app: &AppHandle, request_id: &str, kind: &str, text: &str) {
    let _ = app.emit("ai://event", json!({ "requestId": request_id, "kind": kind, "text": text }));
}

/// Runs one chat call: streams tokens to the UI as `ai://event`, and can be cancelled by `ai_cancel`.
pub async fn run_chat(
    app: &AppHandle,
    llm: &LlmRuntime,
    ai: &AiState,
    request_id: &str,
    request: ChatRequest,
) -> Result<String, String> {
    emit(app, request_id, "loading", "");
    let preferred = ai.preferred();
    let provider = llm.provider(preferred.as_deref()).await.map_err(|e| e.to_string())?;

    let (tx, mut rx) = mpsc::channel::<String>(64);
    let forward = {
        let (app, id) = (app.clone(), request_id.to_owned());
        tauri::async_runtime::spawn(async move {
            while let Some(token) = rx.recv().await {
                emit(&app, &id, "token", &token);
            }
        })
    };

    let (call, handle) = abortable(async move { provider.chat(request, Some(tx)).await });
    ai.inflight.lock().map_err(|e| e.to_string())?.insert(request_id.to_owned(), handle);
    let result = call.await;
    ai.inflight.lock().map_err(|e| e.to_string())?.remove(request_id);
    let _ = forward.await;

    match result {
        Err(_aborted) => Err("cancelled".into()),
        Ok(Err(e)) => Err(e.to_string()),
        Ok(Ok(response)) => {
            emit(app, request_id, "done", "");
            Ok(response.content)
        }
    }
}

#[tauri::command]
pub async fn ai_suggest(
    app: AppHandle,
    llm: State<'_, LlmRuntime>,
    ai: State<'_, AiState>,
    request_id: String,
    prompt: String,
    cwd: Option<String>,
    recent: Vec<RecentCmd>,
) -> Result<Suggestion, String> {
    let context = environment_context(cwd.as_deref(), &recent);
    let request = ChatRequest {
        messages: vec![
            ChatMessage { role: Role::System, content: format!("{SUGGEST_SYSTEM}\n\n{context}") },
            ChatMessage { role: Role::User, content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 400,
        format: ResponseFormat::JsonSchema { name: "suggestion".into(), schema: suggestion_schema() },
    };
    let content = run_chat(&app, &llm, &ai, &request_id, request).await?;
    let mut suggestion: Suggestion =
        serde_json::from_str(content.trim()).map_err(|e| format!("The model returned an unreadable answer: {e}"))?;
    suggestion.command = safety::sanitize(&suggestion.command);
    if suggestion.command.is_empty() {
        return Err("The model did not suggest a command. Try rephrasing.".into());
    }
    suggestion.risk = safety::assess(&suggestion.command, suggestion.risk);
    Ok(suggestion)
}

#[tauri::command]
pub fn ai_cancel(ai: State<'_, AiState>, request_id: String) {
    if let Ok(mut inflight) = ai.inflight.lock() {
        if let Some(handle) = inflight.remove(&request_id) {
            handle.abort();
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Explanation {
    pub explanation: String,
    /// A command that fixes the problem; empty when there is nothing to run.
    #[serde(default)]
    pub command: String,
    #[serde(default = "default_risk")]
    pub risk: Risk,
}

const EXPLAIN_SYSTEM: &str = "A shell command failed. Explain why in plain language and, if a command would fix it, give it. \
Reply with JSON: {\"explanation\", \"command\", \"risk\"}. \
`explanation` is 1 to 3 short sentences naming the actual cause, quoting the key line of the error if useful. \
`command` is ONE single-line shell command that fixes it, or \"\" if no command can fix it (for example a typo in the user's code). \
Never suggest `sudo` unless nothing else works. \
`risk` is \"safe\", \"caution\" or \"danger\" for the fix command.";

fn explanation_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "explanation": { "type": "string" },
            "command": { "type": "string" },
            "risk": { "type": "string", "enum": ["safe", "caution", "danger"] }
        },
        "required": ["explanation", "command", "risk"],
        "additionalProperties": false
    })
}

/// The last `max` characters of `s`, cut on a char boundary.
fn tail_chars(s: &str, max: usize) -> &str {
    let count = s.chars().count();
    if count <= max {
        return s;
    }
    let skip = count - max;
    let (idx, _) = s.char_indices().nth(skip).unwrap_or((0, ' '));
    &s[idx..]
}

#[tauri::command]
pub async fn ai_explain(
    app: AppHandle,
    llm: State<'_, LlmRuntime>,
    ai: State<'_, AiState>,
    request_id: String,
    command: String,
    exit_code: i32,
    output: String,
    cwd: Option<String>,
    recent: Vec<RecentCmd>,
) -> Result<Explanation, String> {
    let context = environment_context(cwd.as_deref(), &recent);
    let user = format!(
        "Command: {command}\nExit code: {exit_code}\nOutput (last lines):\n{}",
        tail_chars(&output, 6000)
    );
    let request = ChatRequest {
        messages: vec![
            ChatMessage { role: Role::System, content: format!("{EXPLAIN_SYSTEM}\n\n{context}") },
            ChatMessage { role: Role::User, content: user },
        ],
        temperature: 0.1,
        max_tokens: 500,
        format: ResponseFormat::JsonSchema { name: "explanation".into(), schema: explanation_schema() },
    };
    let content = run_chat(&app, &llm, &ai, &request_id, request).await?;
    let mut out: Explanation =
        serde_json::from_str(content.trim()).map_err(|e| format!("The model returned an unreadable answer: {e}"))?;
    out.command = safety::sanitize(&out.command);
    out.risk = if out.command.is_empty() { Risk::Safe } else { safety::assess(&out.command, out.risk) };
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

const CHAT_SYSTEM: &str = "You are Wall's built-in terminal assistant, running locally. Answer concisely in plain text. \
When you give shell commands, put each in a fenced ```sh block, one command per block, ready to paste. \
Prefer commands that work on the user's OS and shell. Never claim you ran anything: the user runs commands themselves.";

/// Free-form chat with optional attached blocks; tokens stream as `ai://event`.
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    llm: State<'_, LlmRuntime>,
    ai: State<'_, AiState>,
    request_id: String,
    messages: Vec<ChatTurn>,
    context: String,
    cwd: Option<String>,
    recent: Vec<RecentCmd>,
) -> Result<String, String> {
    let env = environment_context(cwd.as_deref(), &recent);
    let mut system = format!("{CHAT_SYSTEM}\n\n{env}");
    if !context.trim().is_empty() {
        system.push_str(&format!("\nBlocks the user attached:\n{}\n", tail_chars(&context, 8000)));
    }
    let mut msgs = vec![ChatMessage { role: Role::System, content: system }];
    for turn in messages.into_iter().rev().take(12).collect::<Vec<_>>().into_iter().rev() {
        let role = if turn.role == "assistant" { Role::Assistant } else { Role::User };
        msgs.push(ChatMessage { role, content: turn.content });
    }
    let request = ChatRequest { messages: msgs, temperature: 0.3, max_tokens: 1200, format: ResponseFormat::Text };
    run_chat(&app, &llm, &ai, &request_id, request).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepInput {
    pub command: String,
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub skipped: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentStep {
    pub thought: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub summary: String,
    #[serde(default = "default_risk")]
    pub risk: Risk,
}

const AGENT_SYSTEM: &str = "You are an agent that completes the user's goal in their terminal, ONE command at a time. \
After each command you see its exit code and output, then decide the next step. \
Reply with JSON: {\"thought\", \"command\", \"done\", \"summary\", \"risk\"}. \
`thought` is one short sentence about what you are doing next and why. \
`command` is one single-line shell command to run next, or \"\" when done. \
Set `done` true when the goal is reached or cannot be reached; then `summary` tells the user the result in 1-3 sentences. \
`risk` is \"safe\", \"caution\" or \"danger\" for `command`. \
Prefer read-only checks first. Never use sudo unless the user asked. Avoid interactive programs (editors, pagers): \
pass flags like --no-pager or pipe to cat. If a step was skipped by the user, find another way or finish.";

fn agent_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "thought": { "type": "string" },
            "command": { "type": "string" },
            "done": { "type": "boolean" },
            "summary": { "type": "string" },
            "risk": { "type": "string", "enum": ["safe", "caution", "danger"] }
        },
        "required": ["thought", "command", "done", "summary", "risk"],
        "additionalProperties": false
    })
}

/// One step of agent mode: given the goal and what ran so far, the next command (or the final summary).
#[tauri::command]
pub async fn ai_agent_step(
    app: AppHandle,
    llm: State<'_, LlmRuntime>,
    ai: State<'_, AiState>,
    request_id: String,
    goal: String,
    steps: Vec<AgentStepInput>,
    cwd: Option<String>,
) -> Result<AgentStep, String> {
    let env = environment_context(cwd.as_deref(), &[]);
    let mut user = format!("Goal: {goal}\n");
    if steps.is_empty() {
        user.push_str("Nothing has run yet.\n");
    }
    for (i, step) in steps.iter().enumerate() {
        if step.skipped {
            user.push_str(&format!("Step {}: $ {}  [skipped by the user]\n", i + 1, step.command));
        } else {
            let status = step.exit_code.map_or("no exit code".to_owned(), |c| format!("exit {c}"));
            user.push_str(&format!(
                "Step {}: $ {}  [{status}]\nOutput:\n{}\n",
                i + 1,
                step.command,
                tail_chars(&step.output, 2500)
            ));
        }
    }
    let request = ChatRequest {
        messages: vec![
            ChatMessage { role: Role::System, content: format!("{AGENT_SYSTEM}\n\n{env}") },
            ChatMessage { role: Role::User, content: user },
        ],
        temperature: 0.1,
        max_tokens: 500,
        format: ResponseFormat::JsonSchema { name: "agent_step".into(), schema: agent_schema() },
    };
    let content = run_chat(&app, &llm, &ai, &request_id, request).await?;
    let mut step: AgentStep =
        serde_json::from_str(content.trim()).map_err(|e| format!("The model returned an unreadable answer: {e}"))?;
    step.command = safety::sanitize(&step.command);
    if step.command.is_empty() {
        step.done = true;
    } else {
        step.risk = safety::assess(&step.command, step.risk);
    }
    Ok(step)
}
