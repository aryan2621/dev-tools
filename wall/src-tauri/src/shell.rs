use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// Nearest enclosing git branch, read from `.git/HEAD` so no process is spawned.
pub fn git_branch(cwd: &Path) -> Option<String> {
    for dir in cwd.ancestors() {
        let git = dir.join(".git");
        let head_path = if git.is_file() {
            // Worktrees and submodules: `.git` is a file pointing at the real git dir.
            let text = std::fs::read_to_string(&git).ok()?;
            let target = text.trim().strip_prefix("gitdir: ")?.to_owned();
            dir.join(target).join("HEAD")
        } else {
            git.join("HEAD")
        };
        if let Ok(head) = std::fs::read_to_string(head_path) {
            let head = head.trim();
            return Some(head.strip_prefix("ref: refs/heads/").unwrap_or(&head[..head.len().min(8)]).to_owned());
        }
    }
    None
}

#[tauri::command]
pub fn git_info(cwd: String) -> Option<String> {
    git_branch(Path::new(&cwd))
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

fn path_executables() -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let path = std::env::var("PATH").unwrap_or_default();
    // GUI apps on macOS get a minimal PATH; add the usual install locations too.
    let extra = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
    let home = home();
    let mut dirs: Vec<PathBuf> = path.split(':').map(PathBuf::from).collect();
    dirs.extend(extra.iter().map(PathBuf::from));
    dirs.push(home.join(".cargo/bin"));
    dirs.push(home.join(".local/bin"));
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if !name.starts_with('.') {
                    out.insert(name.to_owned());
                }
            }
        }
    }
    out
}

static KNOWN: OnceLock<Vec<String>> = OnceLock::new();

/// Executables on PATH plus zsh builtins, reserved words, aliases and functions. Cached after the first
/// call; the first call runs an interactive zsh once to see the user's aliases.
#[tauri::command]
pub async fn known_commands() -> Vec<String> {
    if let Some(known) = KNOWN.get() {
        return known.clone();
    }
    let mut set = path_executables();
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(6),
        tokio::process::Command::new("/bin/zsh")
            .args(["-ic", "print -l ${(k)builtins} ${(k)reswords} ${(k)aliases} ${(k)functions}"])
            .stdin(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .output(),
    )
    .await;
    if let Ok(Ok(out)) = out {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let name = line.trim();
            if !name.is_empty() && !name.starts_with('_') {
                set.insert(name.to_owned());
            }
        }
    }
    let list: Vec<String> = set.into_iter().collect();
    let _ = KNOWN.set(list.clone());
    list
}

/// Commands from the user's zsh history file (newest last, de-duplicated), for ↑ and ghost suggestions.
#[tauri::command]
pub fn shell_history(limit: usize) -> Vec<String> {
    let file = std::env::var_os("HISTFILE").map(PathBuf::from).unwrap_or_else(|| home().join(".zsh_history"));
    let Ok(bytes) = std::fs::read(file) else { return Vec::new() };
    let text = String::from_utf8_lossy(&bytes);
    let mut entries: Vec<String> = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        // Extended history: ": 1700000000:0;command"
        let cmd = match line.strip_prefix(": ") {
            Some(rest) => rest.split_once(';').map(|(_, c)| c).unwrap_or(rest),
            None => line,
        };
        if let Some(cont) = cmd.strip_suffix('\\') {
            current.push_str(cont);
            current.push('\n');
            continue;
        }
        current.push_str(cmd);
        let done = std::mem::take(&mut current);
        if !done.trim().is_empty() {
            entries.push(done);
        }
    }
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<String> = entries.into_iter().rev().filter(|c| seen.insert(c.clone())).take(limit).collect();
    out.reverse();
    out
}

#[derive(Serialize)]
pub struct Completion {
    pub value: String,
    pub kind: &'static str,
}

/// Completes the last word of `line`: commands for the first word, paths otherwise.
#[tauri::command]
pub async fn complete(line: String, cwd: String) -> Vec<Completion> {
    let word_start = line.rfind([' ', '\t', '|', ';', '&', '(']).map_or(0, |i| i + 1);
    let word = &line[word_start..];
    let is_first = line[..word_start].trim_end().is_empty()
        || line[..word_start].trim_end().ends_with(['|', ';', '&', '(']);

    let mut out = Vec::new();
    if is_first && !word.contains('/') {
        for name in known_commands().await {
            if name.starts_with(word) && !word.is_empty() {
                out.push(Completion { value: name, kind: "command" });
                if out.len() >= 60 {
                    break;
                }
            }
        }
        return out;
    }

    // Path completion relative to cwd, with ~ expansion.
    let (dir_part, file_part) = match word.rfind('/') {
        Some(i) => (&word[..=i], &word[i + 1..]),
        None => ("", word),
    };
    let base = if let Some(rest) = dir_part.strip_prefix("~/") {
        home().join(rest)
    } else if dir_part == "~" {
        home()
    } else if dir_part.starts_with('/') {
        PathBuf::from(dir_part)
    } else {
        Path::new(&cwd).join(dir_part)
    };
    let Ok(entries) = std::fs::read_dir(&base) else { return out };
    let mut items: Vec<Completion> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.starts_with(file_part) || (name.starts_with('.') && !file_part.starts_with('.')) {
                return None;
            }
            let is_dir = e.file_type().is_ok_and(|t| t.is_dir())
                || (e.file_type().is_ok_and(|t| t.is_symlink()) && e.path().is_dir());
            let value = format!("{dir_part}{name}{}", if is_dir { "/" } else { "" });
            Some(Completion { value, kind: if is_dir { "dir" } else { "file" } })
        })
        .collect();
    items.sort_by(|a, b| (a.kind != "dir").cmp(&(b.kind != "dir")).then(a.value.cmp(&b.value)));
    items.truncate(80);
    items
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("settings.json"))
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Value {
    settings_path(&app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: Value) -> Result<(), String> {
    let path = settings_path(&app).ok_or("no app data dir")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub data_dir: String,
    pub version: String,
}

#[tauri::command]
pub fn app_paths(app: AppHandle) -> AppPaths {
    AppPaths {
        data_dir: app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_default(),
        version: app.package_info().version.to_string(),
    }
}
