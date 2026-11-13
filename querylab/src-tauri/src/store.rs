use crate::profile::{ConnectionProfile, URI_FIELDS};
use crate::{secrets, uri_credentials};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, sync::Mutex, time::SystemTime};
use tauri::Manager;

const HISTORY_LIMIT: usize = 100;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub input: String,
    pub operation: Option<String>,
    pub at: u64,
    pub ok: bool,
}

impl HistoryEntry {
    pub fn now(input: &str, operation: Option<&str>, ok: bool) -> Self {
        let at = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Self { input: input.into(), operation: operation.map(String::from), at, ok }
    }
}

pub struct Store {
    dir: PathBuf,
    lock: Mutex<()>,
}

impl Store {
    pub fn open(app: &tauri::AppHandle) -> Result<Self, String> {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(Self { dir, lock: Mutex::new(()) })
    }

    fn read_json<T: DeserializeOwned + Default>(&self, name: &str) -> T {
        let path = self.dir.join(name);
        let Ok(text) = std::fs::read_to_string(&path) else {
            return T::default();
        };
        serde_json::from_str(&text).unwrap_or_else(|_| {
            let _ = std::fs::copy(&path, path.with_extension("json.bak"));
            T::default()
        })
    }

    fn write_json<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        let path = self.dir.join(name);
        let temp = path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
        std::fs::write(&temp, text).map_err(|e| e.to_string())?;
        std::fs::rename(&temp, &path).map_err(|e| e.to_string())
    }

    fn hydrate(profile: &mut ConnectionProfile) {
        profile.password = secrets::read(&profile.id).unwrap_or_default();
        let id = profile.id.clone();
        for (name, field) in URI_FIELDS {
            let secret = secrets::read(&format!("{id}.{name}"));
            let value = field(profile);
            *value = uri_credentials::inserting(secret.as_deref(), value);
        }
    }

    pub fn profiles(&self) -> Vec<ConnectionProfile> {
        let _guard = self.lock.lock().unwrap();
        let mut profiles: Vec<ConnectionProfile> = self.read_json("profiles.json");
        profiles.iter_mut().for_each(Self::hydrate);
        profiles
    }

    pub fn save_profile(&self, mut profile: ConnectionProfile) -> Result<ConnectionProfile, String> {
        profile.normalize();
        let _guard = self.lock.lock().unwrap();
        let mut stored: Vec<ConnectionProfile> = self.read_json("profiles.json");
        let mut stripped = profile.clone();
        for (name, field) in URI_FIELDS {
            let value = field(&mut stripped);
            let (clean, secret) = uri_credentials::stripping(value);
            *value = clean;
            secrets::write(&format!("{}.{name}", stripped.id), secret.as_deref().unwrap_or(""))?;
        }
        secrets::write(&stripped.id, &stripped.password)?;
        stripped.password.clear();
        match stored.iter_mut().find(|existing| existing.id == stripped.id) {
            Some(slot) => *slot = stripped,
            None => stored.push(stripped),
        }
        self.write_json("profiles.json", &stored)?;
        Ok(profile)
    }

    pub fn delete_profile(&self, id: &str) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap();
        let mut stored: Vec<ConnectionProfile> = self.read_json("profiles.json");
        stored.retain(|profile| profile.id != id);
        self.write_json("profiles.json", &stored)?;
        secrets::delete(id);
        for (name, _) in URI_FIELDS {
            secrets::delete(&format!("{id}.{name}"));
        }
        let mut history: BTreeMap<String, Vec<HistoryEntry>> = self.read_json("history.json");
        history.remove(id);
        self.write_json("history.json", &history)
    }

    pub fn profile(&self, id: &str) -> Result<ConnectionProfile, String> {
        let _guard = self.lock.lock().unwrap();
        let stored: Vec<ConnectionProfile> = self.read_json("profiles.json");
        let mut profile = stored.into_iter().find(|profile| profile.id == id).ok_or_else(|| "Connection not found.".to_string())?;
        Self::hydrate(&mut profile);
        Ok(profile)
    }

    pub fn history(&self, id: &str) -> Vec<HistoryEntry> {
        let _guard = self.lock.lock().unwrap();
        let mut all: BTreeMap<String, Vec<HistoryEntry>> = self.read_json("history.json");
        all.remove(id).unwrap_or_default()
    }

    pub fn push_history(&self, id: &str, entry: HistoryEntry) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap();
        let mut all: BTreeMap<String, Vec<HistoryEntry>> = self.read_json("history.json");
        let entries = all.entry(id.to_string()).or_default();
        entries.retain(|existing| !(existing.input == entry.input && existing.operation == entry.operation));
        entries.insert(0, entry);
        entries.truncate(HISTORY_LIMIT);
        self.write_json("history.json", &all)
    }

    pub fn clear_history(&self, id: &str) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap();
        let mut all: BTreeMap<String, Vec<HistoryEntry>> = self.read_json("history.json");
        all.remove(id);
        self.write_json("history.json", &all)
    }
}
