use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Method {
    #[default]
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Patch => "PATCH",
            Method::Delete => "DELETE",
            Method::Head => "HEAD",
            Method::Options => "OPTIONS",
        }
    }

    pub fn parse(text: &str) -> Option<Method> {
        [
            Method::Get,
            Method::Post,
            Method::Put,
            Method::Patch,
            Method::Delete,
            Method::Head,
            Method::Options,
        ]
        .into_iter()
        .find(|method| method.as_str().eq_ignore_ascii_case(text))
    }

    pub fn allows_body(self) -> bool {
        !matches!(self, Method::Get | Method::Head)
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KvItem {
    pub id: String,
    pub enabled: bool,
    pub key: String,
    pub value: String,
    pub is_file: bool,
    pub file_path: String,
}

impl Default for KvItem {
    fn default() -> Self {
        KvItem {
            id: new_id(),
            enabled: true,
            key: String::new(),
            value: String::new(),
            is_file: false,
            file_path: String::new(),
        }
    }
}

impl KvItem {
    pub fn pair(key: &str, value: &str) -> Self {
        KvItem {
            key: key.into(),
            value: value.into(),
            ..Default::default()
        }
    }

    pub fn is_active(&self) -> bool {
        self.enabled && !self.key.trim().is_empty()
    }
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BodyType {
    #[default]
    None,
    Json,
    Text,
    FormUrlEncoded,
    Multipart,
    Binary,
    Graphql,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RequestBody {
    #[serde(rename = "type")]
    pub kind: BodyType,
    pub raw: String,
    pub form_items: Vec<KvItem>,
    pub file_path: String,
    pub graphql_variables: String,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    #[default]
    None,
    Bearer,
    Basic,
    ApiKey,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RequestAuth {
    #[serde(rename = "type")]
    pub kind: AuthType,
    pub token: String,
    pub username: String,
    pub password: String,
    pub key_name: String,
    pub key_value: String,
    pub key_in_query: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RequestSettings {
    pub timeout: f64,
    pub follow_redirects: bool,
    pub allow_insecure_tls: bool,
}

impl Default for RequestSettings {
    fn default() -> Self {
        RequestSettings {
            timeout: 60.0,
            follow_redirects: true,
            allow_insecure_tls: false,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Request {
    pub id: String,
    pub name: String,
    pub method: Method,
    pub url: String,
    pub params: Vec<KvItem>,
    pub headers: Vec<KvItem>,
    pub body: RequestBody,
    pub auth: RequestAuth,
    pub settings: RequestSettings,
    pub captures: Vec<KvItem>,
}

impl Default for Request {
    fn default() -> Self {
        Request {
            id: new_id(),
            name: "Untitled Request".into(),
            method: Method::Get,
            url: String::new(),
            params: vec![],
            headers: vec![],
            body: RequestBody::default(),
            auth: RequestAuth::default(),
            settings: RequestSettings::default(),
            captures: vec![],
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub requests: Vec<Request>,
}

impl Default for Folder {
    fn default() -> Self {
        Folder {
            id: new_id(),
            name: "New Folder".into(),
            requests: vec![],
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub requests: Vec<Request>,
    pub folders: Vec<Folder>,
    pub variables: Vec<KvItem>,
}

impl Default for Collection {
    fn default() -> Self {
        Collection {
            id: new_id(),
            name: "New Collection".into(),
            requests: vec![],
            folders: vec![],
            variables: vec![],
        }
    }
}

impl Collection {
    pub fn requests_mut(&mut self) -> impl Iterator<Item = &mut Request> {
        self.requests
            .iter_mut()
            .chain(self.folders.iter_mut().flat_map(|folder| folder.requests.iter_mut()))
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: Vec<KvItem>,
}

impl Default for Environment {
    fn default() -> Self {
        Environment {
            id: new_id(),
            name: "New Environment".into(),
            variables: vec![],
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Snapshot {
    pub collections: Vec<Collection>,
    pub environments: Vec<Environment>,
    pub active_environment_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub date: u64,
    pub request: Request,
    pub status: u16,
    pub duration_ms: f64,
}

#[derive(Serialize)]
pub struct Header {
    pub name: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct CookieRow {
    pub name: String,
    pub value: String,
    pub detail: String,
}

#[derive(Serialize)]
pub struct Capture {
    pub name: String,
    pub value: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<Header>,
    pub cookies: Vec<CookieRow>,
    pub body: String,
    pub pretty_body: Option<String>,
    pub binary: bool,
    pub image_data_url: Option<String>,
    pub size: usize,
    pub duration_ms: f64,
    pub resolved_url: String,
    pub mime_type: Option<String>,
    pub error: Option<String>,
    pub captured: Vec<Capture>,
    #[serde(skip)]
    pub bytes: Vec<u8>,
}

impl ApiResponse {
    pub fn failure(message: String, resolved_url: String, duration_ms: f64) -> Self {
        ApiResponse {
            error: Some(message),
            resolved_url,
            duration_ms,
            ..Default::default()
        }
    }
}
