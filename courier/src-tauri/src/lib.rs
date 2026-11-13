mod ai;
mod codegen;
mod commands;
mod curl;
mod jsonpath;
mod models;
mod secrets;
mod seed;
mod sender;
mod store;
mod substitution;

use commands::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(AppState::open(dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::save_state,
            commands::list_history,
            commands::clear_history,
            commands::send_request,
            commands::cancel_request,
            commands::save_response,
            commands::unresolved_variables,
            commands::send_blocker,
            commands::generate_code,
            commands::parse_curl,
            commands::pick_file,
            commands::get_ai_settings,
            commands::save_ai_provider,
            commands::set_active_provider,
            commands::list_provider_models,
            commands::ai_step,
            commands::ai_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run");
}
