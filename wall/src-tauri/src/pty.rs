use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyManager {
    pub fn kill_all(&self) {
        if let Ok(mut s) = self.sessions.lock() {
            for (_, mut sess) in s.drain() {
                let _ = sess.child.kill();
            }
        }
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

/// Writes the bundled zsh startup files to a temp ZDOTDIR. They source the user's real
/// dotfiles and then add the OSC 133 / OSC 7 hooks the block tracker relies on.
fn prepare_zdotdir() -> Option<std::path::PathBuf> {
    let dir = std::env::temp_dir().join("wall-zdotdir");
    std::fs::create_dir_all(&dir).ok()?;
    let files = [
        (".zshenv", include_str!("../shell/.zshenv")),
        (".zprofile", include_str!("../shell/.zprofile")),
        (".zshrc", include_str!("../shell/.zshrc")),
        (".zlogin", include_str!("../shell/.zlogin")),
    ];
    for (name, body) in files {
        std::fs::write(dir.join(name), body).ok()?;
    }
    Some(dir)
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let is_zsh = shell.ends_with("/zsh") || shell == "zsh";
    let mut cmd = CommandBuilder::new(shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if is_zsh {
        if let Some(zd) = prepare_zdotdir() {
            let user_zd = std::env::var("ZDOTDIR").or_else(|_| std::env::var("HOME")).unwrap_or_default();
            cmd.env("WALL_USER_ZDOTDIR", user_zd);
            cmd.env("ZDOTDIR", zd);
            // Wall draws its own prompt and input editor; the shell prompt is hidden.
            cmd.env("WALL_BLOCKS", "1");
        }
    }
    if let Some(dir) = cwd.or_else(|| std::env::var("HOME").ok()) {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), PtySession { master: pair.master, writer, child });

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = app.emit(&format!("pty://data/{id}"), B64.encode(&buf[..n]));
                }
            }
        }
        let _ = app.emit(&format!("pty://exit/{id}"), ());
    });
    Ok(())
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    let mut s = state.sessions.lock().map_err(|e| e.to_string())?;
    let sess = s.get_mut(&id).ok_or("no such pty")?;
    sess.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    sess.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<'_, PtyManager>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let s = state.sessions.lock().map_err(|e| e.to_string())?;
    let sess = s.get(&id).ok_or("no such pty")?;
    sess.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    if let Some(mut sess) = state.sessions.lock().map_err(|e| e.to_string())?.remove(&id) {
        let _ = sess.child.kill();
    }
    Ok(())
}
