#![allow(deprecated)]

use crate::oauth;
use rmcp::{
    model::{
        ClientCapabilities, ClientConfig, ElicitRequestParams, ElicitResult, ElicitationAction,
        ElicitationCapability, FormElicitationCapability, Implementation, InputRequest,
        InputRequests, InputResponses, ListRootsResult,         LoggingMessageNotificationParam, ProgressNotificationParam, Root,
        UrlElicitationCapability,
    },
    service::{NotificationContext, RequestContext},
    ClientHandler, ErrorData as McpError, RoleClient,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, watch, Mutex};

static ELICIT_SEQ: AtomicU64 = AtomicU64::new(1);
static SANDBOX_CALL_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub progress: f64,
    pub total: Option<f64>,
    pub message: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationPrompt {
    pub request_id: String,
    pub server_id: String,
    pub mode: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_schema: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_origin: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxCallPrompt {
    pub call_id: String,
    pub server_id: String,
    pub tool_name: String,
    pub arguments: Value,
}

pub struct Bridge {
    pub server_id: String,
    app: AppHandle,
    roots: Vec<String>,
    log: Arc<std::sync::Mutex<String>>,
    elicit: Mutex<HashMap<String, oneshot::Sender<ElicitResult>>>,
    sandbox_calls: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    progress: Mutex<Option<watch::Sender<ProgressEvent>>>,
    cancel: Mutex<Option<watch::Sender<bool>>>,
    catalog: watch::Sender<u64>,
}

impl Bridge {
    pub fn new(
        app: AppHandle,
        server_id: impl Into<String>,
        roots: Vec<String>,
        log: Arc<std::sync::Mutex<String>>,
    ) -> Self {
        let (catalog, _) = watch::channel(0u64);
        Self {
            server_id: server_id.into(),
            app,
            roots,
            log,
            elicit: Mutex::new(HashMap::new()),
            sandbox_calls: Mutex::new(HashMap::new()),
            progress: Mutex::new(None),
            cancel: Mutex::new(None),
            catalog,
        }
    }

    fn bump_catalog(&self) {
        let n = self.catalog.borrow().wrapping_add(1);
        let _ = self.catalog.send(n);
        let _ = self.app.emit(
            "mcp-catalog-changed",
            json!({ "serverId": self.server_id, "generation": n }),
        );
    }

    pub async fn set_call_controls(
        &self,
        progress: watch::Sender<ProgressEvent>,
        cancel: watch::Sender<bool>,
    ) {
        *self.progress.lock().await = Some(progress);
        *self.cancel.lock().await = Some(cancel);
    }

    pub async fn clear_call_controls(&self) {
        *self.progress.lock().await = None;
        *self.cancel.lock().await = None;
    }

    pub async fn trigger_cancel(&self) {
        if let Some(tx) = self.cancel.lock().await.as_ref() {
            let _ = tx.send(true);
        }
    }

    pub async fn respond_elicitation(
        &self,
        request_id: &str,
        action: &str,
        content: Option<Value>,
    ) -> Result<(), String> {
        let action = match action {
            "accept" => ElicitationAction::Accept,
            "decline" => ElicitationAction::Decline,
            "cancel" => ElicitationAction::Cancel,
            _ => return Err("Unknown elicitation action.".into()),
        };
        let accept = matches!(action, ElicitationAction::Accept);
        let mut result = ElicitResult::new(action);
        if accept {
            result = result.with_content(content.unwrap_or(json!({})));
        }
        let tx = self
            .elicit
            .lock()
            .await
            .remove(request_id)
            .ok_or("This elicitation request is no longer waiting.")?;
        let _ = tx.send(result);
        Ok(())
    }

    fn append_log(&self, line: &str) {
        let mut log = self.log.lock().unwrap();
        log.push_str(line);
        if !line.ends_with('\n') {
            log.push('\n');
        }
        if log.len() > 8000 {
            let cut = log.len().saturating_sub(8000);
            let mut start = cut;
            while start < log.len() && !log.is_char_boundary(start) {
                start += 1;
            }
            log.drain(..start);
        }
    }

    pub async fn wait_sandbox_call(&self, tool_name: String, arguments: Value) -> bool {
        let call_id = format!("sb-{}", SANDBOX_CALL_SEQ.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        self.sandbox_calls.lock().await.insert(call_id.clone(), tx);
        let _ = self.app.emit(
            "mcp-sandbox-call",
            SandboxCallPrompt {
                call_id: call_id.clone(),
                server_id: self.server_id.clone(),
                tool_name,
                arguments,
            },
        );
        match tokio::time::timeout(Duration::from_secs(120), rx).await {
            Ok(Ok(allow)) => allow,
            _ => {
                self.sandbox_calls.lock().await.remove(&call_id);
                false
            }
        }
    }

    pub async fn respond_sandbox_call(&self, call_id: &str, allow: bool) -> Result<(), String> {
        let tx = self
            .sandbox_calls
            .lock()
            .await
            .remove(call_id)
            .ok_or("This sandbox call is no longer waiting.")?;
        let _ = tx.send(allow);
        Ok(())
    }

    async fn wait_elicitation(&self, prompt: ElicitationPrompt) -> ElicitResult {
        let request_id = prompt.request_id.clone();
        let (tx, rx) = oneshot::channel();
        self.elicit.lock().await.insert(request_id.clone(), tx);
        let _ = self.app.emit("mcp-elicitation", prompt);
        match tokio::time::timeout(Duration::from_secs(180), rx).await {
            Ok(Ok(r)) => r,
            _ => {
                self.elicit.lock().await.remove(&request_id);
                ElicitResult::new(ElicitationAction::Cancel)
            }
        }
    }

    pub async fn fulfill_inputs(
        &self,
        client: &RelayClient,
        peer: rmcp::Peer<RoleClient>,
        requests: InputRequests,
    ) -> InputResponses {
        let mut out = InputResponses::new();
        for (key, request) in requests {
            let value = match fulfill_one(client, peer.clone(), &key, request).await {
                Ok(v) => v,
                Err(e) => json!({ "error": e.to_string() }),
            };
            out.insert(key, value);
        }
        out
    }
}

pub struct RelayClient {
    pub bridge: Arc<Bridge>,
}

impl RelayClient {
    pub fn new(bridge: Arc<Bridge>) -> Self {
        Self { bridge }
    }
}

impl ClientHandler for RelayClient {
    fn get_info(&self) -> ClientConfig {
        let elicitation = ElicitationCapability::new()
            .with_form(FormElicitationCapability::new())
            .with_url(UrlElicitationCapability::new());
        ClientConfig::new(
            ClientCapabilities::builder()
                .enable_elicitation_with(elicitation)
                .enable_tasks()
                .enable_roots()
                .build(),
            Implementation::new("Relay", env!("CARGO_PKG_VERSION")),
        )
    }

    fn create_elicitation(
        &self,
        request: ElicitRequestParams,
        _context: RequestContext<RoleClient>,
    ) -> impl std::future::Future<Output = Result<ElicitResult, McpError>> + Send + '_ {
        let bridge = self.bridge.clone();
        async move {
            let id = format!("el-{}", ELICIT_SEQ.fetch_add(1, Ordering::Relaxed));
            match request {
                ElicitRequestParams::FormElicitationParams {
                    message,
                    requested_schema,
                    ..
                } => {
                    let schema = serde_json::to_value(&requested_schema).unwrap_or(json!({}));
                    Ok(bridge
                        .wait_elicitation(ElicitationPrompt {
                            request_id: id,
                            server_id: bridge.server_id.clone(),
                            mode: "form".into(),
                            message,
                            requested_schema: Some(schema),
                            url: None,
                            url_origin: None,
                        })
                        .await)
                }
                ElicitRequestParams::UrlElicitationParams { message, url, .. } => {
                    let origin = oauth::external_url_origin(&url).map_err(|e| {
                        McpError::invalid_params(format!("Invalid elicitation URL: {e}"), None)
                    })?;
                    Ok(bridge
                        .wait_elicitation(ElicitationPrompt {
                            request_id: id,
                            server_id: bridge.server_id.clone(),
                            mode: "url".into(),
                            message,
                            requested_schema: None,
                            url: Some(url),
                            url_origin: Some(origin),
                        })
                        .await)
                }
                _ => Err(McpError::invalid_params("Unsupported elicitation mode", None)),
            }
        }
    }

    fn list_roots(
        &self,
        _context: RequestContext<RoleClient>,
    ) -> impl std::future::Future<Output = Result<ListRootsResult, McpError>> + Send + '_ {
        let roots = self
            .bridge
            .roots
            .iter()
            .map(|p| Root::new(p.clone()))
            .collect();
        async move { Ok(ListRootsResult::new(roots)) }
    }

    fn on_progress(
        &self,
        params: ProgressNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        let bridge = self.bridge.clone();
        async move {
            let event = ProgressEvent {
                progress: params.progress,
                total: params.total,
                message: params.message,
            };
            let _ = bridge.app.emit(
                "mcp-progress",
                json!({ "serverId": bridge.server_id, "progress": event }),
            );
            if let Some(tx) = bridge.progress.lock().await.as_ref() {
                let _ = tx.send(event);
            }
        }
    }

    fn on_logging_message(
        &self,
        params: LoggingMessageNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        let bridge = self.bridge.clone();
        async move {
            let level = format!("{:?}", params.level).to_lowercase();
            let logger = params
                .logger
                .as_deref()
                .map(|l| format!(" [{l}]"))
                .unwrap_or_default();
            let data = match &params.data {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            bridge.append_log(&format!("[{level}]{logger} {data}"));
        }
    }

    fn on_tool_list_changed(
        &self,
        _context: NotificationContext<RoleClient>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        let bridge = self.bridge.clone();
        async move { bridge.bump_catalog() }
    }

    fn on_resource_list_changed(
        &self,
        _context: NotificationContext<RoleClient>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        let bridge = self.bridge.clone();
        async move { bridge.bump_catalog() }
    }

    fn on_prompt_list_changed(
        &self,
        _context: NotificationContext<RoleClient>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        let bridge = self.bridge.clone();
        async move { bridge.bump_catalog() }
    }
}

async fn fulfill_one(
    client: &RelayClient,
    peer: rmcp::Peer<RoleClient>,
    key: &str,
    request: InputRequest,
) -> Result<Value, String> {
    use rmcp::{
        model::NumberOrString,
        service::RequestContext,
    };
    let context = RequestContext::new(NumberOrString::String(key.into()), peer);
    match request {
        InputRequest::Elicitation(req) => {
            let r = client
                .create_elicitation(req.params, context)
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(r).map_err(|e| e.to_string())
        }
        InputRequest::ListRoots(_) => {
            let r = client
                .list_roots(context)
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(r).map_err(|e| e.to_string())
        }
        InputRequest::CreateMessage(_) => {
            Err("Sampling is deprecated and not supported in Relay.".into())
        }
        _ => Err("Unsupported input request.".into()),
    }
}
