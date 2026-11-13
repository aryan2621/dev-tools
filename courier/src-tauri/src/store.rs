use crate::{
    ai::AiSettings,
    models::{Collection, Environment, HistoryEntry, Snapshot},
    secrets::SecretVault,
    seed,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

const HISTORY_LIMIT: usize = 200;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct UiState {
    active_environment_id: Option<String>,
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(_) => {
            let backup = path.with_extension(format!("{}.bak.json", now_millis() / 1000));
            let _ = fs::copy(path, backup);
            None
        }
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    let staging = path.with_extension("json.tmp");
    fs::write(&staging, text).map_err(|error| error.to_string())?;
    fs::rename(&staging, path).map_err(|error| error.to_string())
}

pub struct Store {
    dir: PathBuf,
    vault: Mutex<SecretVault>,
    history: Mutex<Vec<HistoryEntry>>,
}

impl Store {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let history = read_json(&dir.join("history.json")).unwrap_or_default();
        Ok(Store {
            dir,
            vault: Mutex::default(),
            history: Mutex::new(history),
        })
    }

    fn file(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }

    pub fn load(&self) -> Result<Snapshot, String> {
        let collections_file = self.file("collections.json");
        let environments_file = self.file("environments.json");
        let first_launch = !collections_file.exists() || !environments_file.exists();
        let mut collections: Vec<Collection> =
            read_json(&collections_file).unwrap_or_else(seed::collections);
        let environments: Vec<Environment> =
            read_json(&environments_file).unwrap_or_else(seed::environments);
        lock(&self.vault).adopt(&mut collections);
        let stored: UiState = read_json(&self.file("state.json")).unwrap_or_default();
        let active_environment_id = stored
            .active_environment_id
            .filter(|id| environments.iter().any(|environment| &environment.id == id))
            .or_else(|| environments.first().map(|environment| environment.id.clone()));
        let snapshot = Snapshot {
            collections,
            environments,
            active_environment_id,
        };
        if first_launch {
            self.save(&snapshot)?;
        }
        Ok(snapshot)
    }

    pub fn save(&self, snapshot: &Snapshot) -> Result<(), String> {
        let collections = lock(&self.vault).protect(&snapshot.collections);
        write_json(&self.file("collections.json"), &collections)?;
        write_json(&self.file("environments.json"), &snapshot.environments)?;
        write_json(
            &self.file("state.json"),
            &UiState {
                active_environment_id: snapshot.active_environment_id.clone(),
            },
        )
    }

    pub fn ai_settings(&self) -> AiSettings {
        read_json(&self.file("ai.json")).unwrap_or_default()
    }

    pub fn save_ai_settings(&self, settings: &AiSettings) -> Result<(), String> {
        write_json(&self.file("ai.json"), settings)
    }

    pub fn history(&self) -> Vec<HistoryEntry> {
        lock(&self.history).clone()
    }

    pub fn record(&self, entry: HistoryEntry) {
        let mut history = lock(&self.history);
        history.insert(0, entry);
        history.truncate(HISTORY_LIMIT);
        let _ = write_json(&self.file("history.json"), &*history);
    }

    pub fn clear_history(&self) {
        let mut history = lock(&self.history);
        history.clear();
        let _ = write_json(&self.file("history.json"), &*history);
    }
}
