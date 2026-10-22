use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};
use tauri::Manager;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub headers: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
    /// Absolute folders this client may reveal through `roots/list`. Never a whole disk.
    #[serde(default)]
    pub roots: Vec<String>,
    /// When set, OAuth callback listens on this localhost port (for static client registration).
    #[serde(default)]
    pub oauth_redirect_port: Option<u16>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub model: String,
    pub base_url: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCase {
    pub id: String,
    pub name: String,
    pub server_id: String,
    pub tool: String,
    pub arguments: serde_json::Value,
    pub contains: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub servers: Vec<Server>,
    #[serde(default)]
    pub providers: Vec<Provider>,
    #[serde(default)]
    pub tests: Vec<TestCase>,
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
pub fn load(app: &tauri::AppHandle) -> Result<Config, String> {
    let path = data_dir(app)?.join("workspace.json");
    if !path.exists() {
        return Ok(Config::default());
    }
    serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Cannot read workspace: {e}"))
}
pub fn save(app: &tauri::AppHandle, cfg: &Config) -> Result<(), String> {
    let dir = data_dir(app)?;
    let temp = dir.join("workspace.json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, dir.join("workspace.json")).map_err(|e| e.to_string())
}
pub fn secret(account: &str) -> Result<String, String> {
    let entry =
        keyring::Entry::new("com.relay.mcp-workbench", account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("Keychain: {e}")),
    }
}
pub fn put_secret(account: &str, value: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new("com.relay.mcp-workbench", account).map_err(|e| e.to_string())?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|e| format!("Keychain: {e}"))
    }
}
/// HTTP server configured with a static bearer token header (not OAuth sign-in).
pub fn prefers_bearer_token(s: &Server) -> bool {
    s.headers
        .iter()
        .any(|h| h.eq_ignore_ascii_case("authorization"))
}

fn sync_server_lists_from_secrets(s: &mut Server, secrets: &BTreeMap<String, String>) -> bool {
    let mut changed = false;
    for key in secrets.keys() {
        if let Some(name) = key.strip_prefix("header:") {
            if !name.is_empty() && !s.headers.iter().any(|h| h == name) {
                s.headers.push(name.to_string());
                changed = true;
            }
        } else if let Some(name) = key.strip_prefix("env:") {
            if !name.is_empty() && !s.env.iter().any(|e| e == name) {
                s.env.push(name.to_string());
                changed = true;
            }
        }
    }
    changed
}

/// Align server header/env lists with Keychain secret keys.
pub fn sync_server_profiles_from_secrets(cfg: &mut Config) -> Result<bool, String> {
    let mut changed = false;
    for s in &mut cfg.servers {
        let secrets = server_secrets(&s.id)?;
        changed |= sync_server_lists_from_secrets(s, &secrets);
    }
    Ok(changed)
}

pub fn server_secrets(id: &str) -> Result<BTreeMap<String, String>, String> {
    let raw = secret(&format!("server:{id}"))?;
    if raw.is_empty() {
        Ok(BTreeMap::new())
    } else {
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }
}

pub fn validate_server(s: &Server) -> Result<(), String> {
    if s.name.trim().is_empty() {
        return Err("Give the server a name.".into());
    }
    if s.transport == "stdio" {
        if s.command.trim().is_empty() {
            return Err("Enter an executable command.".into());
        }
    } else if s.transport == "http" {
        let url = reqwest::Url::parse(&s.url).map_err(|_| "Enter a valid HTTP or HTTPS URL.")?;
        if !["http", "https"].contains(&url.scheme()) || url.host_str().is_none() {
            return Err("Use an HTTP or HTTPS server URL.".into());
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err("Put credentials in headers, not in the URL.".into());
        }
        for header in &s.headers {
            reqwest::header::HeaderName::from_bytes(header.as_bytes())
                .map_err(|_| "Invalid header name.")?;
            if [
                "host",
                "content-length",
                "connection",
                "mcp-session-id",
                "mcp-protocol-version",
            ]
            .contains(&header.to_lowercase().as_str())
            {
                return Err(format!("{header} is managed by the transport."));
            }
        }
    } else {
        return Err("Unsupported transport.".into());
    }
    for root in &s.roots {
        validate_root(root)?;
    }
    if let Some(port) = s.oauth_redirect_port {
        if !(1024..=65535).contains(&port) {
            return Err("OAuth redirect port must be between 1024 and 65535.".into());
        }
    }
    Ok(())
}

/// A root is one folder the server is allowed to see. The filesystem root is rejected.
fn validate_root(path: &str) -> Result<(), String> {
    let path = std::path::Path::new(path.trim());
    if path.as_os_str().is_empty() {
        return Err("A root path is empty.".into());
    }
    if !path.is_absolute() {
        return Err(format!(
            "Root {} must be an absolute path.",
            path.display()
        ));
    }
    if path.components().count() <= 1 {
        return Err("A root cannot be the whole disk.".into());
    }
    Ok(())
}
