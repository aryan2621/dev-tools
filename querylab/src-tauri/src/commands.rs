use crate::engine::{EngineMeta, ENGINES};
use crate::error::DriverError;
use crate::model::{QueryResult, SchemaInfo, DEFAULT_ROW_LIMIT};
use crate::profile::ConnectionProfile;
use crate::session::Sessions;
use crate::store::{HistoryEntry, Store};
use crate::ai::{self, AiSettingsView, Provider, Step, ToolDef, ToolOutput};
use crate::secrets;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::task::AbortHandle;

type CommandResult<T> = Result<T, String>;

fn failure(error: impl ToString) -> String {
    error.to_string()
}

#[tauri::command]
pub fn engines() -> Vec<EngineMeta> {
    ENGINES.iter().map(|spec| spec.meta()).collect()
}

#[tauri::command]
pub fn profiles_list(store: State<Store>) -> Vec<ConnectionProfile> {
    store.profiles()
}

#[tauri::command]
pub fn profile_save(store: State<Store>, profile: ConnectionProfile) -> CommandResult<ConnectionProfile> {
    store.save_profile(profile)
}

#[tauri::command]
pub async fn profile_delete(store: State<'_, Store>, sessions: State<'_, Sessions>, id: String) -> CommandResult<()> {
    sessions.disconnect(&id).await;
    store.delete_profile(&id)
}

#[tauri::command]
pub async fn connect(store: State<'_, Store>, sessions: State<'_, Sessions>, id: String) -> CommandResult<()> {
    sessions.connect(store.profile(&id)?).await.map_err(failure)
}

#[tauri::command]
pub async fn test_connection(mut profile: ConnectionProfile) -> CommandResult<()> {
    profile.normalize();
    let driver = crate::drivers::make(profile).map_err(failure)?;
    let outcome = driver.connect().await;
    driver.disconnect().await;
    outcome.map_err(failure)
}

#[tauri::command]
pub async fn disconnect(sessions: State<'_, Sessions>, id: String) -> CommandResult<()> {
    sessions.disconnect(&id).await;
    Ok(())
}

#[tauri::command]
pub fn connected_ids(sessions: State<Sessions>) -> Vec<String> {
    sessions.connected_ids()
}

#[tauri::command]
pub async fn run_query(
    store: State<'_, Store>,
    sessions: State<'_, Sessions>,
    id: String,
    run_id: String,
    input: String,
    operation: Option<String>,
    row_limit: Option<usize>,
) -> CommandResult<QueryResult> {
    let outcome = sessions
        .run(&id, &run_id, &input, operation.as_deref(), row_limit.unwrap_or(DEFAULT_ROW_LIMIT))
        .await;
    if !matches!(outcome, Err(DriverError::Cancelled)) {
        store.push_history(&id, HistoryEntry::now(&input, operation.as_deref(), outcome.is_ok()))?;
    }
    outcome.map_err(failure)
}

#[tauri::command]
pub fn cancel_run(sessions: State<Sessions>, run_id: String) {
    sessions.cancel(&run_id);
}

#[tauri::command]
pub async fn schema(sessions: State<'_, Sessions>, id: String) -> CommandResult<SchemaInfo> {
    sessions.driver(&id).map_err(failure)?.schema().await.map_err(failure)
}

#[tauri::command]
pub fn history_list(store: State<Store>, id: String) -> Vec<HistoryEntry> {
    store.history(&id)
}

#[tauri::command]
pub fn history_clear(store: State<Store>, id: String) -> CommandResult<()> {
    store.clear_history(&id)
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
}

#[tauri::command]
pub fn export_result(
    path: String,
    format: ExportFormat,
    columns: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
) -> CommandResult<()> {
    let bytes = match format {
        ExportFormat::Csv => {
            let mut writer = csv::Writer::from_writer(Vec::new());
            writer.write_record(&columns).map_err(failure)?;
            for row in &rows {
                writer.write_record(row.iter().map(|cell| cell.as_deref().unwrap_or(""))).map_err(failure)?;
            }
            writer.into_inner().map_err(failure)?
        }
        ExportFormat::Json => {
            let objects: Vec<Value> = rows
                .iter()
                .map(|row| {
                    let object: Map<String, Value> = columns
                        .iter()
                        .zip(row)
                        .map(|(name, cell)| (name.clone(), cell.clone().map(Value::String).unwrap_or(Value::Null)))
                        .collect();
                    Value::Object(object)
                })
                .collect();
            serde_json::to_vec_pretty(&objects).map_err(failure)?
        }
    };
    std::fs::write(path, bytes).map_err(failure)
}

#[derive(Default)]
pub struct AiTask(Mutex<Option<AbortHandle>>);

#[tauri::command]
pub fn get_ai_settings(store: State<Store>) -> AiSettingsView {
    store.ai_settings().view()
}

#[tauri::command]
pub fn save_ai_provider(store: State<Store>, provider: Provider, key: Option<String>) -> CommandResult<AiSettingsView> {
    if let Some(key) = key {
        secrets::save_provider_key(&provider.id, key.trim())?;
    }
    let mut settings = store.ai_settings();
    settings.upsert(provider);
    store.save_ai_settings(&settings)?;
    Ok(settings.view())
}

#[tauri::command]
pub fn set_active_provider(store: State<Store>, id: String) -> CommandResult<AiSettingsView> {
    let mut settings = store.ai_settings();
    settings.active = id;
    store.save_ai_settings(&settings)?;
    Ok(settings.view())
}

#[tauri::command]
pub async fn list_provider_models(provider: Provider) -> CommandResult<Vec<String>> {
    ai::list_models(provider).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_step(
    app: AppHandle,
    task: State<'_, AiTask>,
    provider: Provider,
    history: Vec<Value>,
    input: String,
    results: Vec<ToolOutput>,
    tools: Vec<ToolDef>,
    system: Option<String>,
) -> CommandResult<Option<Step>> {
    let handle = tokio::spawn(async move {
        ai::step(provider, history, input, results, tools, system, move |text| {
            let _ = app.emit("ai-delta", text);
        })
        .await
    });
    *task.0.lock().unwrap() = Some(handle.abort_handle());
    let outcome = handle.await;
    *task.0.lock().unwrap() = None;
    match outcome {
        Ok(step) => step.map(Some),
        Err(error) if error.is_cancelled() => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn ai_cancel(task: State<AiTask>) {
    if let Some(handle) = task.0.lock().unwrap().take() {
        handle.abort();
    }
}
