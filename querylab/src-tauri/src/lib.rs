mod ai;
mod commands;
mod drivers;
mod engine;
mod error;
mod http;
mod model;
mod parsers;
mod profile;
mod secrets;
mod session;
mod sql_split;
mod store;
mod uri_credentials;

use tauri::Manager;

fn menu_without_close_window(handle: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItemKind};
    let menu = Menu::default(handle)?;
    for item in menu.items()? {
        let MenuItemKind::Submenu(submenu) = item else { continue };
        for child in submenu.items()? {
            if let MenuItemKind::Predefined(predefined) = &child {
                if predefined.text()?.starts_with("Close") {
                    submenu.remove(&child)?;
                }
            }
        }
    }
    Ok(menu)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(store::Store::open(app.handle())?);
            app.manage(session::Sessions::default());
            app.manage(commands::AiTask::default());
            app.set_menu(menu_without_close_window(app.handle())?)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::engines,
            commands::profiles_list,
            commands::profile_save,
            commands::profile_delete,
            commands::connect,
            commands::test_connection,
            commands::disconnect,
            commands::connected_ids,
            commands::run_query,
            commands::apply_edits,
            commands::cancel_run,
            commands::schema,
            commands::history_list,
            commands::history_clear,
            commands::export_result,
            commands::get_ai_settings,
            commands::save_ai_provider,
            commands::list_provider_models,
            commands::ai_step,
            commands::ai_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start");
}
