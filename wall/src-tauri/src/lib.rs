mod ai;
mod commands;
mod history;
mod llm;
mod pty;
mod safety;
mod shell;

use tauri::Manager;

/// Opens (or focuses) the dashboard window: Home (stats and history) and Settings, kept out of the
/// terminal window the way Murmur keeps its main window apart from the widget. `view` is "home"
/// or "settings[/section]". Async so the window is built off the IPC thread.
#[tauri::command]
async fn open_dashboard(app: tauri::AppHandle, view: String) {
    use tauri::{Emitter, WebviewUrl, WebviewWindowBuilder};
    if let Some(w) = app.get_webview_window("dashboard") {
        let _ = w.emit("navigate", &view);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let builder = WebviewWindowBuilder::new(&app, "dashboard", WebviewUrl::App(format!("index.html#{view}").into()))
        .title("Wall")
        .inner_size(1000.0, 700.0)
        .min_inner_size(820.0, 560.0)
        .center();
    // As in Murmur: content runs under the traffic lights, and the translucent window plus the
    // system sidebar material gives native vibrancy behind the sidebar; the page paints its own
    // opaque background for the content area.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .transparent(true)
        .effects(
            tauri::window::EffectsBuilder::new()
                .effect(tauri::window::Effect::Sidebar)
                .state(tauri::window::EffectState::FollowsWindowActiveState)
                .build(),
        );
    if let Err(e) = builder.build() {
        eprintln!("could not open the dashboard: {e}");
    }
}

/// Brings the terminal window to the front (the dashboard's "insert into terminal").
#[tauri::command]
fn focus_terminal(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(pty::PtyManager::default())
        .manage(ai::AiState::default())
        .setup(|app| {
            // No ⌘W "Close Window" here: ⌘W closes a pane. Edit items keep copy/paste working in the webview.
            {
                use tauri::menu::{Menu, PredefinedMenuItem as P, Submenu};
                let h = app.handle();
                let menu = Menu::with_items(
                    h,
                    &[
                        &Submenu::with_items(
                            h,
                            "Wall",
                            true,
                            &[&P::about(h, None, None)?, &P::separator(h)?, &P::hide(h, None)?, &P::hide_others(h, None)?, &P::separator(h)?, &P::quit(h, None)?],
                        )?,
                        &Submenu::with_items(
                            h,
                            "Edit",
                            true,
                            &[&P::undo(h, None)?, &P::redo(h, None)?, &P::separator(h)?, &P::cut(h, None)?, &P::copy(h, None)?, &P::paste(h, None)?, &P::select_all(h, None)?],
                        )?,
                        &Submenu::with_items(h, "Window", true, &[&P::minimize(h, None)?, &P::fullscreen(h, None)?])?,
                    ],
                )?;
                app.set_menu(menu)?;
            }
            let data_dir = app.path().app_data_dir()?;
            let runtime = llm::LlmRuntime::new(data_dir, llm::llama_server::Supervisor::locate_binary())?;
            app.manage(runtime);
            app.manage(history::History::open(&app.path().app_data_dir()?)?);
            // Off the setup thread: scanning processes would delay the first paint.
            let handle = app.handle().clone();
            std::thread::spawn(move || handle.state::<llm::LlmRuntime>().stop_leftover_servers());
            Ok(())
        })
        // The terminal is the app: closing it quits, dashboard included.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_dashboard,
            focus_terminal,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            commands::llm_catalog,
            commands::llm_download,
            commands::llm_cancel_download,
            commands::llm_stop,
            ai::ai_suggest,
            ai::ai_cancel,
            ai::ai_explain,
            ai::ai_chat,
            ai::ai_agent_step,
            ai::ai_set_model,
            history::history_record,
            history::history_event,
            history::history_search,
            history::history_stats,
            history::history_clear,
            shell::git_info,
            shell::known_commands,
            shell::shell_history,
            shell::complete,
            shell::settings_load,
            shell::settings_save,
            shell::app_paths,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Wall")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<pty::PtyManager>().kill_all();
                if let Some(llm) = app.try_state::<llm::LlmRuntime>() {
                    llm.shutdown();
                }
            }
        });
}
