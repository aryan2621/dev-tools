use crate::engine::EngineKind;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub engine: EngineKind,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub database: String,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub ssl_mode: String,
    #[serde(default)]
    pub options: BTreeMap<String, String>,
}

type StringField = fn(&mut ConnectionProfile) -> &mut String;

pub const URI_FIELDS: [(&str, StringField); 1] = [("uri", |profile| &mut profile.uri)];

impl ConnectionProfile {
    pub fn option(&self, key: &str) -> &str {
        self.options.get(key).map(String::as_str).unwrap_or("")
    }

    pub fn trust_server_cert(&self) -> bool {
        self.option("trustServerCert") == "true"
    }

    pub fn normalize(&mut self) {
        let spec = self.engine.spec();
        if self.id.is_empty() {
            self.id = uuid::Uuid::new_v4().to_string();
        }
        if self.host.trim().is_empty() {
            self.host = "127.0.0.1".into();
        }
        if self.port == 0 {
            self.port = spec.default_port;
        }
        if self.ssl_mode.is_empty() {
            self.ssl_mode = spec.default_ssl_mode.into();
        }
        if self.uri.is_empty() && self.engine == EngineKind::Mongodb {
            self.uri = "mongodb://localhost:27017".into();
        }
        if self.name.trim().is_empty() {
            self.name = self.default_name();
        }
    }

    fn default_name(&self) -> String {
        match self.engine {
            EngineKind::Sqlite => "Local SQLite".into(),
            EngineKind::Mongodb => self.engine.spec().display_name.into(),
            engine => format!("{} @ {}", engine.spec().display_name, self.host),
        }
    }

    pub fn http_base_url(&self) -> String {
        let host = self.host.trim_end_matches('/');
        if host.starts_with("http://") || host.starts_with("https://") {
            return host.to_string();
        }
        match self.engine {
            EngineKind::Databricks => format!("{}://{}", self.ssl_mode, host),
            _ => format!("{}://{}:{}", self.ssl_mode, host, self.port),
        }
    }
}
