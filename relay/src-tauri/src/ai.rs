use crate::store::{self, Provider};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

pub const OLLAMA_URL: &str = "http://localhost:11434";

#[derive(Clone, Deserialize, Serialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ToolOutput {
    pub id: String,
    pub content: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Call {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Serialize)]
pub struct Step {
    pub text: String,
    pub calls: Vec<Call>,
    pub history: Vec<Value>,
}

fn key_required(id: &str) -> bool {
    matches!(id, "openai" | "claude" | "gemini")
}

fn base(provider: &Provider) -> String {
    let url = provider.base_url.trim().trim_end_matches('/');
    if url.is_empty() && provider.id == "ollama" {
        OLLAMA_URL.into()
    } else {
        url.into()
    }
}

fn openai_compatible_base(provider: &Provider) -> String {
    let url = base(provider);
    match provider.id.as_str() {
        "ollama" => format!("{}/v1", url.trim_end_matches("/v1")),
        _ => url,
    }
}

pub fn endpoint(provider: &Provider) -> Result<String, String> {
    Ok(match provider.id.as_str() {
        "openai" => "https://api.openai.com/v1/responses".into(),
        "claude" => "https://api.anthropic.com/v1/messages".into(),
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".into(),
        "ollama" | "compatible" => {
            let url = openai_compatible_base(provider);
            if url.is_empty() {
                return Err("Enter the server URL in Providers first.".into());
            }
            format!("{url}/chat/completions")
        }
        _ => return Err("Unknown AI provider.".into()),
    })
}

fn apply_sampling(body: &mut Value, provider: &Provider, max_tokens_key: &str) {
    if let Some(value) = provider.temperature {
        body["temperature"] = json!(value);
    }
    if let Some(value) = provider.top_p {
        body["top_p"] = json!(value);
    }
    if let Some(value) = provider.max_tokens {
        body[max_tokens_key] = json!(value);
    }
}

static OLLAMA_CONTEXT_MODELS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

async fn with_ollama_context(mut provider: Provider) -> Result<Provider, String> {
    let Some(num_ctx) = provider.num_ctx.filter(|_| provider.id == "ollama") else {
        return Ok(provider);
    };
    let derived = format!("{}-ctx{num_ctx}", provider.model);
    let known = OLLAMA_CONTEXT_MODELS.lock().map_err(|e| e.to_string())?.contains(&derived);
    if !known {
        let response = client()?
            .post(format!("{}/api/create", base(&provider).trim_end_matches("/v1")))
            .json(&json!({"model": derived, "from": provider.model, "parameters": {"num_ctx": num_ctx}, "stream": false}))
            .send()
            .await
            .map_err(|e| format!("Could not set the context window: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("Could not set the context window: {}", response.text().await.unwrap_or_default()));
        }
        OLLAMA_CONTEXT_MODELS.lock().map_err(|e| e.to_string())?.push(derived.clone());
    }
    provider.model = derived;
    Ok(provider)
}

pub fn request_body(
    provider: &Provider,
    mut history: Vec<Value>,
    input: &str,
    results: &[ToolOutput],
    tools: &[ToolDef],
    system: Option<&str>,
) -> (Value, Vec<Value>) {
    let claude = provider.id == "claude";
    if let Some(system) = system.filter(|_| !claude) {
        let has_system = history.iter().any(|m| m["role"] == "system");
        if !has_system {
            history.insert(0, json!({"role": "system", "content": system}));
        }
    }
    if !input.is_empty() {
        history.push(json!({"role": "user", "content": input}));
    }
    if claude {
        if !results.is_empty() {
            let blocks: Vec<Value> = results
                .iter()
                .map(|r| json!({"type": "tool_result", "tool_use_id": r.id, "content": r.content}))
                .collect();
            history.push(json!({"role": "user", "content": blocks}));
        }
        let mut body = json!({"model": provider.model, "max_tokens": 4096, "messages": history, "stream": true});
        apply_sampling(&mut body, provider, "max_tokens");
        if let Some(system) = system {
            body["system"] = json!(system);
        }
        if !tools.is_empty() {
            body["tools"] = json!(tools
                .iter()
                .map(|t| json!({"name": t.name, "description": t.description, "input_schema": t.parameters}))
                .collect::<Vec<_>>());
        }
        return (body, history);
    }
    if provider.id == "openai" {
        for r in results {
            history.push(json!({"type": "function_call_output", "call_id": r.id, "output": r.content}));
        }
        let tools: Vec<Value> = tools
            .iter()
            .map(|t| json!({"type": "function", "name": t.name, "description": t.description, "parameters": t.parameters, "strict": false}))
            .collect();
        let mut body = json!({"model": provider.model, "input": history, "store": false, "stream": true, "tools": tools});
        apply_sampling(&mut body, provider, "max_output_tokens");
        return (body, history);
    }
    for r in results {
        history.push(json!({"role": "tool", "tool_call_id": r.id, "content": r.content}));
    }
    let mut body = json!({"model": provider.model, "messages": history, "stream": true});
    apply_sampling(&mut body, provider, "max_tokens");
    if !tools.is_empty() {
        body["tools"] = json!(tools
            .iter()
            .map(|t| json!({"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}))
            .collect::<Vec<_>>());
    }
    (body, history)
}

fn arguments(value: &Value) -> Result<Value, String> {
    let parsed = match value.as_str() {
        Some(text) => serde_json::from_str(text).map_err(|_| "The model produced invalid JSON tool arguments.")?,
        None => value.clone(),
    };
    if parsed.is_object() {
        Ok(parsed)
    } else {
        Err("The model's tool arguments were not a JSON object.".into())
    }
}

fn call(id: &Value, name: &Value, args: &Value) -> Result<Call, String> {
    Ok(Call {
        id: id.as_str().ok_or("Missing call ID")?.into(),
        name: name.as_str().ok_or("Missing tool name")?.into(),
        arguments: arguments(args)?,
    })
}

pub fn parse_response(provider: &str, response: Value, mut history: Vec<Value>) -> Result<Step, String> {
    let mut calls = vec![];
    let mut text = String::new();
    match provider {
        "openai" => {
            let items = response["output"].as_array().ok_or("Provider response has no output.")?;
            for item in items {
                if item["type"] == "function_call" {
                    calls.push(call(&item["call_id"], &item["name"], &item["arguments"])?);
                }
                for part in item["content"].as_array().into_iter().flatten() {
                    text.push_str(part["text"].as_str().unwrap_or_default());
                }
            }
            history.extend(items.clone());
        }
        "claude" => {
            let items = response["content"].as_array().ok_or("Provider response has no content.")?;
            for item in items {
                if item["type"] == "tool_use" {
                    calls.push(call(&item["id"], &item["name"], &item["input"])?);
                }
                text.push_str(item["text"].as_str().unwrap_or_default());
            }
            history.push(json!({"role": "assistant", "content": items}));
        }
        _ => {
            let message = response["choices"][0]["message"].clone();
            if !message.is_object() {
                return Err("Provider response has no assistant message.".into());
            }
            text = message["content"].as_str().unwrap_or_default().into();
            for item in message["tool_calls"].as_array().into_iter().flatten() {
                calls.push(call(&item["id"], &item["function"]["name"], &item["function"]["arguments"])?);
            }
            history.push(message);
        }
    }
    Ok(Step { text, calls, history })
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())
}

fn authorize(request: reqwest::RequestBuilder, provider: &Provider, key: &str) -> reqwest::RequestBuilder {
    if key.is_empty() {
        request
    } else if provider.id == "claude" {
        request.header("x-api-key", key).header("anthropic-version", "2023-06-01")
    } else {
        request.bearer_auth(key)
    }
}

fn resolve_key(provider: &Provider) -> Result<String, String> {
    let key = store::secret(&format!("provider:{}", provider.id))?;
    if key_required(&provider.id) && key.is_empty() {
        return Err("Save your API key in Providers first.".into());
    }
    Ok(key)
}

fn rejection(status: reqwest::StatusCode, value: &Value, key: &str) -> String {
    let mut detail = value["error"]["message"].as_str().unwrap_or("Request rejected").to_string();
    if !key.is_empty() {
        detail = detail.replace(key, "[redacted]");
    }
    format!("Provider {status}: {detail}")
}

async fn send_json(request: reqwest::RequestBuilder, key: &str) -> Result<Value, String> {
    let response = request.send().await.map_err(|error| format!("Could not reach provider: {error}"))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|_| format!("Provider returned a non-JSON response ({status})."))?;
    if status.is_success() {
        return Ok(value);
    }
    Err(rejection(status, &value, key))
}

async fn stream_events(
    request: reqwest::RequestBuilder,
    key: &str,
    mut on_event: impl FnMut(Value) -> Result<(), String>,
) -> Result<(), String> {
    let response = request.send().await.map_err(|error| format!("Could not reach provider: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let value: Value = response.json().await.unwrap_or(Value::Null);
        return Err(rejection(status, &value, key));
    }
    let mut bytes = response.bytes_stream();
    let mut buffer: Vec<u8> = vec![];
    while let Some(chunk) = bytes.next().await {
        buffer.extend_from_slice(&chunk.map_err(|error| format!("Stream interrupted: {error}"))?);
        while let Some(end) = buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = buffer.drain(..=end).collect();
            let line = String::from_utf8_lossy(&line);
            let Some(data) = line.trim().strip_prefix("data:") else { continue };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<Value>(data) {
                on_event(event)?;
            }
        }
    }
    Ok(())
}

fn stream_error(event: &Value) -> Option<String> {
    let failed = event["type"] == "error" || event["type"] == "response.failed" || event.get("error").is_some_and(|e| !e.is_null());
    let detail = event["error"]["message"]
        .as_str()
        .or(event["message"].as_str())
        .or(event["response"]["error"]["message"].as_str())
        .unwrap_or("The stream failed.");
    failed.then(|| format!("Provider error: {detail}"))
}

async fn stream_response(
    provider: &Provider,
    request: reqwest::RequestBuilder,
    key: &str,
    on_text: &impl Fn(&str),
) -> Result<Value, String> {
    match provider.id.as_str() {
        "openai" => {
            let mut completed = Value::Null;
            stream_events(request, key, |event| {
                if let Some(error) = stream_error(&event) {
                    return Err(error);
                }
                match event["type"].as_str() {
                    Some("response.output_text.delta") => on_text(event["delta"].as_str().unwrap_or_default()),
                    Some("response.completed") => completed = event["response"].clone(),
                    _ => {}
                }
                Ok(())
            })
            .await?;
            Ok(completed)
        }
        "claude" => {
            let mut blocks: Vec<Value> = vec![];
            let mut partial: Vec<String> = vec![];
            stream_events(request, key, |event| {
                if let Some(error) = stream_error(&event) {
                    return Err(error);
                }
                let index = event["index"].as_u64().unwrap_or(0) as usize;
                match event["type"].as_str() {
                    Some("content_block_start") => {
                        blocks.resize(index + 1, Value::Null);
                        partial.resize(index + 1, String::new());
                        blocks[index] = event["content_block"].clone();
                    }
                    Some("content_block_delta") if index < blocks.len() => {
                        if let Some(text) = event["delta"]["text"].as_str() {
                            on_text(text);
                            let current = blocks[index]["text"].as_str().unwrap_or_default().to_string();
                            blocks[index]["text"] = json!(current + text);
                        } else if let Some(json) = event["delta"]["partial_json"].as_str() {
                            partial[index].push_str(json);
                        }
                    }
                    _ => {}
                }
                Ok(())
            })
            .await?;
            for (block, json) in blocks.iter_mut().zip(&partial) {
                if block["type"] == "tool_use" {
                    block["input"] = if json.is_empty() {
                        json!({})
                    } else {
                        serde_json::from_str(json).map_err(|_| "The model produced invalid JSON tool arguments.")?
                    };
                }
            }
            Ok(json!({"content": blocks}))
        }
        _ => {
            let mut text = String::new();
            let mut calls: Vec<Value> = vec![];
            stream_events(request, key, |event| {
                if let Some(error) = stream_error(&event) {
                    return Err(error);
                }
                let delta = &event["choices"][0]["delta"];
                if let Some(chunk) = delta["content"].as_str().filter(|chunk| !chunk.is_empty()) {
                    on_text(chunk);
                    text.push_str(chunk);
                }
                for item in delta["tool_calls"].as_array().into_iter().flatten() {
                    let id = item["id"].as_str().unwrap_or_default();
                    let index = match item["index"].as_u64() {
                        Some(index) => index as usize,
                        None if !id.is_empty() || calls.is_empty() => calls.len(),
                        None => calls.len() - 1,
                    };
                    if calls.len() <= index {
                        calls.resize(index + 1, json!({"id": "", "type": "function", "function": {"name": "", "arguments": ""}}));
                    }
                    let entry = &mut calls[index];
                    if !id.is_empty() {
                        entry["id"] = json!(id);
                    }
                    for field in ["name", "arguments"] {
                        if let Some(part) = item["function"][field].as_str() {
                            let joined = format!("{}{part}", entry["function"][field].as_str().unwrap_or_default());
                            entry["function"][field] = json!(joined);
                        }
                    }
                }
                Ok(())
            })
            .await?;
            let content = if text.is_empty() { Value::Null } else { json!(text) };
            let mut message = json!({"role": "assistant", "content": content});
            if !calls.is_empty() {
                message["tool_calls"] = json!(calls);
            }
            Ok(json!({"choices": [{"message": message}]}))
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn step(
    provider: Provider,
    history: Vec<Value>,
    input: String,
    results: Vec<ToolOutput>,
    tools: Vec<ToolDef>,
    system: Option<String>,
    on_text: impl Fn(&str),
) -> Result<Step, String> {
    if provider.model.trim().is_empty() {
        return Err("Choose a model in Providers first.".into());
    }
    let provider = with_ollama_context(provider).await?;
    let endpoint = endpoint(&provider)?;
    let (body, history) = request_body(&provider, history, &input, &results, &tools, system.as_deref());
    let key = resolve_key(&provider)?;
    let request = authorize(client()?.post(endpoint).json(&body), &provider, &key);
    parse_response(&provider.id, stream_response(&provider, request, &key, &on_text).await?, history)
}

fn model_names(provider: &str, value: &Value) -> Vec<String> {
    let (items, field) = match provider {
        "ollama" => (&value["models"], "name"),
        _ => (&value["data"], "id"),
    };
    let mut names: Vec<String> = items
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item[field].as_str())
        .map(|name| name.trim_start_matches("models/").to_string())
        .collect();
    names.sort();
    names
}

pub async fn list_models(provider: Provider) -> Result<Vec<String>, String> {
    let url = match provider.id.as_str() {
        "openai" => "https://api.openai.com/v1/models".to_string(),
        "claude" => "https://api.anthropic.com/v1/models?limit=100".to_string(),
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/models".to_string(),
        "ollama" => format!("{}/api/tags", base(&provider)),
        "compatible" if !base(&provider).is_empty() => format!("{}/models", base(&provider)),
        "compatible" => return Err("Enter the server URL first.".into()),
        _ => return Err("Unknown AI provider.".into()),
    };
    let key = resolve_key(&provider)?;
    let request = authorize(client()?.get(url), &provider, &key);
    Ok(model_names(&provider.id, &send_json(request, &key).await?))
}

pub fn playground_system(mcp_instructions: Option<&str>, tools: &[ToolDef]) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();
    let catalog: Vec<String> = tools
        .iter()
        .filter(|t| !t.name.starts_with("relay_"))
        .map(|t| {
            let d = t.description.trim();
            if d.is_empty() {
                format!("- {}", t.name)
            } else {
                format!("- {}: {}", t.name, d)
            }
        })
        .collect();
    if !catalog.is_empty() {
        lines.push(
            "You are in Relay Playground. The user connected an MCP server with these tools:"
                .into(),
        );
        lines.extend(catalog);
        lines.push(String::new());
        lines.push(
            "Answer questions about what the tools can do using this list. \
             When the user wants data or actions, call the matching tool — \
             do not say you lack access to connected tools."
                .into(),
        );
    }
    if let Some(instr) = mcp_instructions {
        if !lines.is_empty() {
            lines.push(String::new());
        }
        lines.push(instr.to_string());
    }
    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}
