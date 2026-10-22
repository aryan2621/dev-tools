use rquickjs::{Context, Runtime};
use serde_json::Value;

const MAX_SANDBOX_JSON_BYTES: usize = 256 * 1024;

/// Evaluate JavaScript and return JSON. Host `callTool` is injected when a hook is provided.
pub fn run_javascript(
    code: String,
    call_tool: Option<impl Fn(String, Value) -> Result<Value, String> + Send + Sync + 'static>,
) -> Result<Value, String> {
    let runtime = Runtime::new().map_err(|e| e.to_string())?;
    let context = Context::full(&runtime).map_err(|e| e.to_string())?;
    context
        .with(|ctx| {
            if let Some(call_tool) = call_tool {
                let hook = std::sync::Arc::new(std::sync::Mutex::new(call_tool));
                let hook = hook.clone();
                let callback = rquickjs::function::MutFn::new(
                    move |name: String, args_json: String| -> String {
                        let args: Value = serde_json::from_str(&args_json)
                            .unwrap_or(Value::Object(Default::default()));
                        match hook.lock().unwrap()(name, args) {
                            Ok(v) => {
                                serde_json::to_string(&v).unwrap_or_else(|_| "{}".into())
                            }
                            Err(e) => serde_json::json!({ "error": e }).to_string(),
                        }
                    },
                );
                let call = rquickjs::Function::new(ctx.clone(), callback)
                    .map_err(|e| e.to_string())?;
                ctx.globals()
                    .set("callTool", call)
                    .map_err(|e| e.to_string())?;
            }
            let wrapped = format!("JSON.stringify((function(){{ {code} }})())");
            let out: String = ctx.eval(wrapped).map_err(|e| e.to_string())?;
            if out.len() > MAX_SANDBOX_JSON_BYTES {
                return Err("Sandbox output exceeded 256 KB.".into());
            }
            serde_json::from_str(&out).map_err(|e| format!("Sandbox returned invalid JSON: {e}"))
        })
        .map_err(|e| e.to_string())?
}

pub fn run_javascript_with_timeout(
    code: String,
    timeout: std::time::Duration,
    call_tool: Option<impl Fn(String, Value) -> Result<Value, String> + Send + Sync + 'static>,
) -> Result<Value, String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let _ = tx.send(run_javascript(code, call_tool));
    });
    rx.recv_timeout(timeout)
        .map_err(|_| "Code execution timed out.".to_string())?
}
