mod commands;
mod drivers;
mod engine;
mod error;
mod http;
mod model;
mod parsers;
mod process;
mod profile;
mod secrets;
mod session;
mod sql_split;
mod store;
mod uri_credentials;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(store::Store::open(app.handle())?);
            app.manage(session::Sessions::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::engines,
            commands::profiles_list,
            commands::profile_save,
            commands::profile_delete,
            commands::connect,
            commands::disconnect,
            commands::connected_ids,
            commands::run_query,
            commands::cancel_run,
            commands::schema,
            commands::history_list,
            commands::history_clear,
            commands::export_result,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start");
}
