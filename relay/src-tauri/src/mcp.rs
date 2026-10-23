use crate::{
    oauth,
    relay_client::{Bridge, ProgressEvent, RelayClient},
    store::{self, Server},
};
use rmcp::{
    model::{
        CallToolRequest, CallToolRequestParams, ClientRequest, GetPromptRequestParams,
        GetTaskParams, JsonObject, ReadResourceRequestParams, ServerResult, TaskPayload,
        UpdateTaskParams,
    },
    service::{PeerRequestOptions, ServiceError},
    service::ClientInitializeError,
    service::RunningService,
    transport::{
        auth::AuthClient, streamable_http_client::StreamableHttpClientTransportConfig,
        StreamableHttpClientTransport, TokioChildProcess,
    },
    RoleClient, ServiceExt,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    process::Stdio,
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};
use tauri::AppHandle;
use tokio::{
    io::AsyncReadExt,
    process::{ChildStderr, Command},
    sync::{watch, Mutex},
};

pub const CLOSED: &str = "The server's connection closed. Reconnect it from Servers.";
const CALL_TIMEOUT: Duration = Duration::from_secs(90);
const TASK_LIMIT: Duration = Duration::from_secs(15 * 60);
const MRTR_MAX_ROUNDS: usize = 10;
const CALL_TIMED_OUT: &str =
    "Tool call timed out. Its server-side effects may still have occurred; inspect before retrying.";
const CALL_CANCELLED: &str = "Tool call cancelled.";

pub type Connection = Arc<RunningService<RoleClient, RelayClient>>;
pub type Log = Arc<std::sync::Mutex<String>>;

#[derive(Clone)]
pub struct Session {
    pub conn: Connection,
    pub log: Log,
    pub signed_in: bool,
    pub bridge: Arc<Bridge>,
}

#[derive(Default)]
pub struct Sessions(pub Mutex<HashMap<String, Session>>);

#[cfg(windows)]
pub fn shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| std::env::var("PATH").unwrap_or_default())
}

#[cfg(not(windows))]
pub fn shell_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let mut cmd = std::process::Command::new(shell);
        cmd.args(["-ilc", "printf '__RELAY_PATH__%s__RELAY_PATH__' \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(cmd.output());
        });
        let from_shell = rx
            .recv_timeout(Duration::from_secs(5))
            .ok()
            .and_then(|o| o.ok())
            .and_then(|o| {
                let out = String::from_utf8_lossy(&o.stdout).into_owned();
                out.split("__RELAY_PATH__").nth(1).map(str::to_owned)
            })
            .unwrap_or_default();
        let current = std::env::var("PATH").unwrap_or_default();
        let fallback = [
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".into(),
            format!("{home}/.local/bin"),
            format!("{home}/.cargo/bin"),
            format!("{home}/.bun/bin"),
        ];
        let mut dirs: Vec<String> = vec![];
        for d in from_shell
            .split(':')
            .chain(current.split(':'))
            .map(str::to_owned)
            .chain(fallback)
        {
            if !d.is_empty() && !dirs.contains(&d) {
                dirs.push(d);
            }
        }
        dirs.join(":")
    })
}

#[cfg(windows)]
fn windows_program(program: std::path::PathBuf, path: &str) -> std::path::PathBuf {
    if program.extension().is_some() || program.components().count() > 1 {
        return program;
    }
    for dir in std::env::split_paths(path) {
        for ext in ["exe", "cmd", "bat"] {
            let candidate = dir.join(&program).with_extension(ext);
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    program
}

fn collect_stderr(stderr: Option<ChildStderr>) -> Log {
    let log = Arc::new(std::sync::Mutex::new(String::new()));
    if let Some(mut stderr) = stderr {
        let log = log.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            while let Ok(n @ 1..) = stderr.read(&mut buf).await {
                let mut l = log.lock().unwrap();
                l.push_str(&String::from_utf8_lossy(&buf[..n]));
                if l.len() > 4000 {
                    let mut cut = l.len() - 4000;
                    while !l.is_char_boundary(cut) {
                        cut += 1;
                    }
                    l.drain(..cut);
                }
            }
        });
    }
    log
}

async fn serve_client(
    app: AppHandle,
    server_id: &str,
    s: &Server,
    log: Log,
    transport: impl rmcp::transport::Transport<RoleClient> + Send + 'static,
    timeout: Duration,
) -> Result<Session, String> {
    let bridge = Arc::new(Bridge::new(app, server_id, s.roots.clone(), log.clone()));
    let client = RelayClient::new(bridge.clone());
    let started = tokio::time::timeout(timeout, client.serve(transport)).await;
    match started {
        Ok(Ok(running)) => Ok(Session {
            conn: Arc::new(running),
            log,
            signed_in: false,
            bridge,
        }),
        Ok(Err(e)) => Err(format!("The server stopped before it finished starting ({e}).")),
        Err(_) => Err("The server did not answer in time.".into()),
    }
}

pub async fn connect_with(
    app: AppHandle,
    server_id: &str,
    s: &Server,
    secrets: BTreeMap<String, String>,
) -> Result<Session, String> {
    store::validate_server(s)?;
    if s.transport == "stdio" {
        let program = if s.args == ["--example-mcp"] {
            std::env::current_exe().map_err(|e| e.to_string())?
        } else {
            s.command.trim().into()
        };
        let path = tokio::task::spawn_blocking(shell_path)
            .await
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let program = windows_program(program, path);
        let mut command = Command::new(&program);
        command.args(&s.args).env("PATH", path).kill_on_drop(true);
        if !s.cwd.is_empty() {
            command.current_dir(&s.cwd);
        }
        for name in &s.env {
            if let Some(v) = secrets.get(&format!("env:{name}")) {
                command.env(name, v);
            }
        }
        let (transport, stderr) = TokioChildProcess::builder(command)
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::NotFound if !s.cwd.is_empty() && !std::path::Path::new(&s.cwd).is_dir() => {
                    format!("Working directory {} does not exist.", s.cwd)
                }
                std::io::ErrorKind::NotFound => format!(
                    "Could not find \"{}\". Check the name, or use its full path (run `which {}` in Terminal).",
                    program.display(),
                    program.display()
                ),
                std::io::ErrorKind::PermissionDenied => {
                    format!("\"{}\" is not executable.", program.display())
                }
                _ => format!("Could not start server: {e}"),
            })?;
        let log = collect_stderr(stderr);
        match serve_client(app, server_id, s, log.clone(), transport, Duration::from_secs(60)).await
        {
            Ok(session) => return Ok(session),
            Err(mut failure) => {
                tokio::time::sleep(Duration::from_millis(300)).await;
                let output = log.lock().unwrap().trim().to_string();
                if !output.is_empty() {
                    failure = format!("{failure} Its output:\n{output}");
                } else if failure.is_empty() {
                    failure = "The server did not answer within 60 seconds.".into();
                }
                return Err(failure);
            }
        }
    }

    let mut headers = HashMap::new();
    for name in &s.headers {
        if let Some(value) = secrets.get(&format!("header:{name}")) {
            headers.insert(
                reqwest::header::HeaderName::from_bytes(name.as_bytes())
                    .map_err(|_| "Invalid header name")?,
                reqwest::header::HeaderValue::from_str(value)
                    .map_err(|_| "Invalid header value")?,
            );
        }
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let has_auth_header = headers.contains_key(&reqwest::header::AUTHORIZATION);
    let config = StreamableHttpClientTransportConfig::with_uri(s.url.clone())
        .custom_headers(headers)
        .reinit_on_expired_session(false);
    let sign_in = oauth::saved_sign_in(s).await?;
    let signed_in = sign_in.is_some();
    let log = Arc::new(std::sync::Mutex::new(String::new()));
    let bridge = Arc::new(Bridge::new(
        app.clone(),
        server_id,
        s.roots.clone(),
        log.clone(),
    ));
    let relay = RelayClient::new(bridge.clone());
    let timed = if let Some(auth) = sign_in {
        let transport =
            StreamableHttpClientTransport::with_client(AuthClient::new(client, auth), config);
        tokio::time::timeout(Duration::from_secs(30), relay.serve(transport)).await
    } else {
        let transport = StreamableHttpClientTransport::with_client(client, config);
        tokio::time::timeout(Duration::from_secs(30), relay.serve(transport)).await
    };
    let started: Result<
        rmcp::service::RunningService<RoleClient, RelayClient>,
        ClientInitializeError,
    > = match timed {
        Ok(Ok(running)) => Ok(running),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(ClientInitializeError::Cancelled),
    };
    match started {
        Ok(running) => Ok(Session {
            conn: Arc::new(running),
            log,
            signed_in,
            bridge,
        }),
        Err(e) if e.auth_challenge().is_some() && !has_auth_header => {
            if store::prefers_bearer_token(s) {
                Err(
                    "Bearer token required. Set the Authorization header on this server, then use Connect (not Sign in)."
                        .into(),
                )
            } else {
                Err(oauth::SIGN_IN_REQUIRED.into())
            }
        }
        Err(e) if e.auth_challenge().is_some() => Err(
            "The server rejected the Authorization header (401). Check its value, or remove it to sign in instead.".into(),
        ),
        Err(ClientInitializeError::Cancelled) => Err("Connection timed out.".into()),
        Err(e) => Err(format!("Connection failed: {e}.")),
    }
}

pub async fn refresh_inspect(sessions: &Sessions, id: &str) -> Result<Value, String> {
    let session = sessions
        .0
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| "Connect this server first.".to_string())?;
    let mut info = inspect(&session.conn).await?;
    info["signedIn"] = json!(session.signed_in);
    Ok(info)
}

pub async fn inspect(c: &Connection) -> Result<Value, String> {
    let caps = c
        .peer_info()
        .map(|info| serde_json::to_value(info.as_ref()).unwrap_or_default())
        .unwrap_or_default();
    let tools = if caps["capabilities"]["tools"].is_object() {
        serde_json::to_value(c.list_all_tools().await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
    } else {
        json!([])
    };
    Ok(json!({"info": caps, "tools": tools}))
}

pub async fn session_bridge(sessions: &Sessions, id: &str) -> Result<Arc<Bridge>, String> {
    sessions
        .0
        .lock()
        .await
        .get(id)
        .map(|s| s.bridge.clone())
        .ok_or_else(|| "Connect this server first.".into())
}

pub async fn cancel_active_call(sessions: &Sessions, id: &str) -> Result<(), String> {
    session_bridge(sessions, id).await?.trigger_cancel().await;
    Ok(())
}

pub async fn respond_elicitation(
    sessions: &Sessions,
    server_id: &str,
    request_id: &str,
    action: &str,
    content: Option<Value>,
) -> Result<(), String> {
    session_bridge(sessions, server_id)
        .await?
        .respond_elicitation(request_id, action, content)
        .await
}

async fn poll_task(
    session: &Session,
    task_id: &str,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<Value, String> {
    let deadline = Instant::now() + TASK_LIMIT;
    let c = session.conn.clone();
    let bridge = session.bridge.clone();
    let client = c.service();
    let peer = c.peer().clone();
    loop {
        if Instant::now() > deadline {
            let _ = c
                .cancel_task(rmcp::model::CancelTaskParams::new(task_id))
                .await;
            return Err("Task timed out.".into());
        }
        let state = c
            .get_task(GetTaskParams::new(task_id))
            .await
            .map_err(|e| e.to_string())?;
        let poll_ms = state.task.task.poll_interval_ms.unwrap_or(1000).max(200);
        match state.task.payload {
            TaskPayload::Completed { result } => return Ok(Value::Object(result)),
            TaskPayload::Failed { error } => {
                return Err(format!("Task failed: {}", serde_json::to_string(&error).unwrap_or_default()));
            }
            TaskPayload::Cancelled => return Err("Task was cancelled.".into()),
            TaskPayload::InputRequired { input_requests } => {
                let responses = bridge
                    .fulfill_inputs(client, peer.clone(), input_requests)
                    .await;
                c.update_task(UpdateTaskParams::new(task_id, responses))
                    .await
                    .map_err(|e| e.to_string())?;
            }
            _ => {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_millis(poll_ms)) => {}
                    _ = cancelled(cancel_rx) => {
                        let _ = c
                            .cancel_task(rmcp::model::CancelTaskParams::new(task_id))
                            .await;
                        return Err(CALL_CANCELLED.into());
                    }
                }
            }
        }
    }
}

/// Resolves once the cancel switch flips to true; never if its sender goes away.
async fn cancelled(rx: &mut watch::Receiver<bool>) {
    loop {
        if *rx.borrow_and_update() {
            return;
        }
        if rx.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

enum Wait {
    Done(Box<ServerResult>),
    TimedOut,
    Cancelled,
}

/// Wait for one request's response. The idle deadline resets whenever progress arrives.
async fn wait_response(
    rx: &mut tokio::sync::oneshot::Receiver<Result<ServerResult, ServiceError>>,
    progress_rx: &mut watch::Receiver<ProgressEvent>,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<Wait, String> {
    let mut deadline = Instant::now() + CALL_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(Wait::TimedOut);
        }
        tokio::select! {
            changed = progress_rx.changed() => {
                if changed.is_ok() {
                    deadline = Instant::now() + CALL_TIMEOUT;
                }
            }
            r = tokio::time::timeout(remaining, &mut *rx) => {
                return match r {
                    Ok(Ok(Ok(resp))) => Ok(Wait::Done(Box::new(resp))),
                    Ok(Ok(Err(e))) => Err(e.to_string()),
                    Ok(Err(_)) => Err(CLOSED.into()),
                    Err(_) => Ok(Wait::TimedOut),
                };
            }
            _ = cancelled(cancel_rx) => return Ok(Wait::Cancelled),
        }
    }
}

pub async fn call(session: &Session, name: String, arguments: Value) -> Result<Value, String> {
    if !arguments.is_object() {
        return Err("Tool arguments must be a JSON object.".into());
    }
    let args: JsonObject = arguments.as_object().cloned().unwrap_or_default();
    let params = if args.is_empty() {
        CallToolRequestParams::new(name)
    } else {
        CallToolRequestParams::new(name).with_arguments(args)
    };
    let c = session.conn.clone();
    let bridge = session.bridge.clone();

    let (progress_tx, mut progress_rx) = watch::channel(ProgressEvent {
        progress: 0.0,
        total: None,
        message: Some("Starting…".into()),
    });
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    let call_id = bridge.register_call(cancel_tx).await;
    let result = run_call(
        session,
        &c,
        &bridge,
        params,
        &progress_tx,
        &mut progress_rx,
        &mut cancel_rx,
    )
    .await;
    bridge.unregister_call(call_id).await;
    result
}

/// Drive one tools/call: MRTR input rounds and task polling, all under the same
/// idle timeout and cancel switch. Cancel/timeout notify the server.
async fn run_call(
    session: &Session,
    c: &Connection,
    bridge: &Arc<Bridge>,
    mut params: CallToolRequestParams,
    progress_tx: &watch::Sender<ProgressEvent>,
    progress_rx: &mut watch::Receiver<ProgressEvent>,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<Value, String> {
    for _round in 0..MRTR_MAX_ROUNDS {
        let mut handle = c
            .peer()
            .send_cancellable_request(
                ClientRequest::CallToolRequest(CallToolRequest::new(params.clone())),
                PeerRequestOptions::no_options(),
            )
            .await
            .map_err(|e| e.to_string())?;
        let token = handle.progress_token.clone();
        bridge.watch_progress(token.clone(), progress_tx.clone()).await;
        let waited = wait_response(&mut handle.rx, progress_rx, cancel_rx).await;
        bridge.unwatch_progress(&token).await;
        let response = match waited? {
            Wait::Done(r) => r,
            Wait::TimedOut => {
                let _ = handle.cancel(Some("Client timed out.".into())).await;
                return Err(CALL_TIMED_OUT.into());
            }
            Wait::Cancelled => {
                let _ = handle.cancel(Some("Cancelled by user.".into())).await;
                return Err(CALL_CANCELLED.into());
            }
        };
        match *response {
            ServerResult::CallToolResult(r) => {
                return serde_json::to_value(r).map_err(|e| e.to_string())
            }
            ServerResult::CreateTaskResult(t) => {
                return poll_task(session, &t.task.task_id, cancel_rx).await
            }
            ServerResult::InputRequiredResult(r) => {
                let requests = r.input_requests.unwrap_or_default();
                if requests.is_empty() && r.request_state.is_none() {
                    return Err("Server asked for input but sent no requests.".into());
                }
                let responses = tokio::select! {
                    responses = bridge.fulfill_inputs(c.service(), c.peer().clone(), requests) => responses,
                    _ = cancelled(cancel_rx) => return Err(CALL_CANCELLED.into()),
                };
                params.input_responses = (!responses.is_empty()).then_some(responses);
                params.request_state = r.request_state;
            }
            _ => return Err("Unexpected tool response from server.".into()),
        }
    }
    Err(format!(
        "Server still needed input after {MRTR_MAX_ROUNDS} rounds; giving up."
    ))
}

pub async fn get_prompt(
    session: &Session,
    name: String,
    arguments: Value,
) -> Result<Value, String> {
    let mut params = GetPromptRequestParams::new(name);
    if let Some(obj) = arguments.as_object() {
        if !obj.is_empty() {
            params = params.with_arguments(JsonObject::from(obj.clone()));
        }
    }
    let c = session.conn.clone();
    tokio::time::timeout(CALL_TIMEOUT, c.get_prompt_with_mrtr_max_rounds(params, 10))
        .await
        .map_err(|_| "Prompt timed out.")?
        .map_err(|e| e.to_string())
        .and_then(|r| serde_json::to_value(r).map_err(|e| e.to_string()))
}

pub async fn read_resource(session: &Session, uri: String) -> Result<Value, String> {
    let params = ReadResourceRequestParams::new(uri);
    let c = session.conn.clone();
    tokio::time::timeout(CALL_TIMEOUT, c.read_resource_with_mrtr_max_rounds(params, 10))
        .await
        .map_err(|_| "Read timed out.")?
        .map_err(|e| e.to_string())
        .and_then(|r| serde_json::to_value(r).map_err(|e| e.to_string()))
}

pub async fn complete_argument(
    c: &Connection,
    reference: Value,
    argument: Value,
    context: Option<Value>,
) -> Result<Value, String> {
    use rmcp::model::{ArgumentInfo, CompleteRequestParams, Reference};
    let r#ref = if reference["type"] == "ref/prompt" {
        Reference::for_prompt(reference["name"].as_str().unwrap_or(""))
    } else {
        Reference::for_resource(reference["uriTemplate"].as_str().unwrap_or(""))
    };
    let ctx = context.and_then(|c| {
        serde_json::from_value::<rmcp::model::CompletionContext>(c).ok()
    });
    let arg = ArgumentInfo::new(
        argument["name"].as_str().unwrap_or(""),
        argument["value"].as_str().unwrap_or(""),
    );
    let params = match ctx {
        Some(ctx) => CompleteRequestParams::new(r#ref, arg).with_context(ctx),
        None => CompleteRequestParams::new(r#ref, arg),
    };
    let result = c.complete(params).await.map_err(|e| e.to_string())?;
    serde_json::to_value(result.completion).map_err(|e| e.to_string())
}
