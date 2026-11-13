use crate::{
    ai::{self, AiSettingsView, Provider, Step, ToolDef, ToolOutput},
    secrets,
    codegen::{self, CodeTarget},
    curl,
    models::{new_id, ApiResponse, HistoryEntry, KvItem, Request, RequestAuth, Snapshot},
    sender,
    store::{lock, now_millis, Store},
    substitution::{unresolved_names, variable_map},
};
use std::{collections::HashMap, path::PathBuf, sync::Mutex};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tokio::task::AbortHandle;

const AI_TASK: &str = "ai";

pub struct AppState {
    store: Store,
    sends: Mutex<HashMap<String, AbortHandle>>,
    bodies: Mutex<HashMap<String, Vec<u8>>>,
}

impl AppState {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        Ok(AppState {
            store: Store::open(dir)?,
            sends: Mutex::default(),
            bodies: Mutex::default(),
        })
    }
}

fn without_secrets(request: &Request) -> Request {
    let mut safe = request.clone();
    safe.auth = RequestAuth {
        kind: request.auth.kind,
        username: request.auth.username.clone(),
        key_name: request.auth.key_name.clone(),
        key_in_query: request.auth.key_in_query,
        ..Default::default()
    };
    safe
}

async fn pick_path() -> Option<PathBuf> {
    rfd::AsyncFileDialog::new()
        .pick_file()
        .await
        .map(|file| file.path().to_path_buf())
}

#[tauri::command]
pub fn load_state(state: State<AppState>) -> Result<Snapshot, String> {
    state.store.load()
}

#[tauri::command]
pub fn save_state(state: State<AppState>, snapshot: Snapshot) -> Result<(), String> {
    state.store.save(&snapshot)
}

#[tauri::command]
pub fn list_history(state: State<AppState>) -> Vec<HistoryEntry> {
    state.store.history()
}

#[tauri::command]
pub fn clear_history(state: State<AppState>) {
    state.store.clear_history();
}

#[tauri::command]
pub async fn send_request(
    state: State<'_, AppState>,
    request: Request,
    variables: Vec<KvItem>,
) -> Result<Option<ApiResponse>, String> {
    let variables = variable_map(&variables);
    let id = request.id.clone();
    let task_request = request.clone();
    let task = tokio::spawn(async move { sender::send(&task_request, &variables).await });
    lock(&state.sends).insert(id.clone(), task.abort_handle());
    let outcome = task.await;
    lock(&state.sends).remove(&id);
    let mut response = match outcome {
        Ok(response) => response,
        Err(error) if error.is_cancelled() => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    lock(&state.bodies).insert(id, std::mem::take(&mut response.bytes));
    if response.error.is_none() {
        state.store.record(HistoryEntry {
            id: new_id(),
            date: now_millis(),
            request: without_secrets(&request),
            status: response.status,
            duration_ms: response.duration_ms,
        });
    }
    Ok(Some(response))
}

#[tauri::command]
pub fn cancel_request(state: State<AppState>, request_id: String) {
    if let Some(handle) = lock(&state.sends).remove(&request_id) {
        handle.abort();
    }
}

#[tauri::command]
pub async fn save_response(
    state: State<'_, AppState>,
    request_id: String,
    file_name: String,
) -> Result<(), String> {
    let Some(bytes) = lock(&state.bodies).get(&request_id).cloned() else {
        return Err("No response to save.".into());
    };
    let Some(target) = rfd::AsyncFileDialog::new().set_file_name(file_name).save_file().await else {
        return Ok(());
    };
    tokio::fs::write(target.path(), bytes)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn unresolved_variables(request: Request, variables: Vec<KvItem>) -> Vec<String> {
    unresolved_names(&request, &variable_map(&variables))
}

#[tauri::command]
pub fn send_blocker(request: Request) -> Option<String> {
    sender::missing_file(&request)
}

#[tauri::command]
pub fn generate_code(target: CodeTarget, request: Request, variables: Vec<KvItem>) -> Result<String, String> {
    let prepared = sender::prepare(&request, &variable_map(&variables))?;
    Ok(codegen::generate(target, &prepared))
}

#[tauri::command]
pub fn parse_curl(text: String) -> Option<Request> {
    curl::parse(&text)
}

#[tauri::command]
pub async fn pick_file() -> Option<String> {
    pick_path().await.map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_ai_settings(state: State<AppState>) -> AiSettingsView {
    state.store.ai_settings().view()
}

#[tauri::command]
pub fn save_ai_provider(
    state: State<AppState>,
    provider: Provider,
    key: Option<String>,
) -> Result<AiSettingsView, String> {
    if let Some(key) = key {
        secrets::save_provider_key(&provider.id, key.trim())?;
    }
    let mut settings = state.store.ai_settings();
    settings.upsert(provider);
    state.store.save_ai_settings(&settings)?;
    Ok(settings.view())
}

#[tauri::command]
pub fn set_active_provider(state: State<AppState>, id: String) -> Result<AiSettingsView, String> {
    let mut settings = state.store.ai_settings();
    settings.active = id;
    state.store.save_ai_settings(&settings)?;
    Ok(settings.view())
}

#[tauri::command]
pub async fn list_provider_models(provider: Provider) -> Result<Vec<String>, String> {
    ai::list_models(provider).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_step(
    app: AppHandle,
    state: State<'_, AppState>,
    provider: Provider,
    history: Vec<Value>,
    input: String,
    results: Vec<ToolOutput>,
    tools: Vec<ToolDef>,
    system: Option<String>,
) -> Result<Option<Step>, String> {
    let task = tokio::spawn(async move {
        ai::step(provider, history, input, results, tools, system, move |text| {
            let _ = app.emit("ai-delta", text);
        })
        .await
    });
    lock(&state.sends).insert(AI_TASK.into(), task.abort_handle());
    let outcome = task.await;
    lock(&state.sends).remove(AI_TASK);
    match outcome {
        Ok(step) => step.map(Some),
        Err(error) if error.is_cancelled() => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn ai_cancel(state: State<AppState>) {
    cancel_request(state, AI_TASK.into());
}
