use tauri::{AppHandle, Emitter, State};

use crate::llm::download::ProgressSink;
use crate::llm::{CatalogView, LlmRuntime};
use std::sync::Arc;

#[tauri::command]
pub async fn llm_catalog(llm: State<'_, LlmRuntime>, ai: State<'_, crate::ai::AiState>) -> Result<CatalogView, String> {
    let preferred = ai.preferred();
    Ok(llm.catalog(preferred.as_deref()).await)
}

#[tauri::command]
pub fn llm_download(app: AppHandle, llm: State<'_, LlmRuntime>, model_id: String) -> Result<(), String> {
    let sink: ProgressSink = Arc::new(move |progress| {
        let _ = app.emit("llm://download-progress", progress);
    });
    llm.download(&model_id, sink).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn llm_cancel_download(llm: State<'_, LlmRuntime>) {
    llm.cancel_download();
}

#[tauri::command]
pub async fn llm_stop(llm: State<'_, LlmRuntime>) -> Result<(), String> {
    llm.stop().await;
    Ok(())
}
