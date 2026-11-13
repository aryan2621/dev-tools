use crate::engine::{CliTool, EngineSpec};
use crate::error::{DriverError, DriverResult};
use std::{io::Write, path::{Path, PathBuf}, process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(600);

#[cfg(target_os = "windows")]
const KNOWN_DIRECTORIES: &[&str] = &[
    "C:\\Program Files\\Amazon\\AWSCLIV2",
    "C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\180\\Tools\\Binn",
    "C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn",
    "C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin",
];

#[cfg(not(target_os = "windows"))]
const KNOWN_DIRECTORIES: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/opt/awscli/bin",
    "/opt/homebrew/opt/mssql-tools18/bin",
    "/opt/homebrew/opt/cassandra/bin",
    "/opt/homebrew/opt/google-cloud-sdk/bin",
    "/usr/local/bin",
    "/usr/local/share/google-cloud-sdk/bin",
    "/opt/mssql-tools18/bin",
    "/opt/mssql-tools/bin",
    "/usr/bin",
    "/bin",
];

pub struct ProcessOutput {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub struct ProcessSpec<'a> {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub stdin: Option<String>,
    pub env: Vec<(&'a str, String)>,
}

impl<'a> ProcessSpec<'a> {
    pub fn new(program: PathBuf, args: Vec<String>) -> Self {
        Self { program, args, stdin: None, env: Vec::new() }
    }

    pub fn stdin(mut self, input: impl Into<String>) -> Self {
        self.stdin = Some(input.into());
        self
    }

    pub fn env(mut self, key: &'a str, value: impl Into<String>) -> Self {
        self.env.push((key, value.into()));
        self
    }
}

pub struct SecretFile(PathBuf);

impl SecretFile {
    pub fn create(contents: &str) -> DriverResult<Self> {
        let path = std::env::temp_dir().join(format!("querylab-{}", uuid::Uuid::new_v4()));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        options.open(&path)?.write_all(contents.as_bytes())?;
        Ok(Self(path))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for SecretFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn override_variable(name: &str) -> String {
    format!("QL_{}_PATH", name.to_uppercase().replace('-', "_"))
}

pub fn locate(binaries: &[&str]) -> Option<PathBuf> {
    for name in binaries {
        if let Ok(path) = std::env::var(override_variable(name)) {
            let path = PathBuf::from(path);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    let mut search: Vec<PathBuf> = KNOWN_DIRECTORIES.iter().map(PathBuf::from).collect();
    if let Some(path_var) = std::env::var_os("PATH") {
        search.extend(std::env::split_paths(&path_var));
    }
    let joined = std::env::join_paths(search).ok()?;
    binaries
        .iter()
        .find_map(|name| which::which_in(name, Some(&joined), std::env::current_dir().ok()?).ok())
}

pub fn require(tool: &CliTool) -> DriverResult<PathBuf> {
    locate(tool.binaries).ok_or_else(|| DriverError::BinaryMissing {
        name: tool.binaries[0].to_string(),
        hint: tool.install_hint.to_string(),
    })
}

pub fn require_for(spec: &EngineSpec) -> DriverResult<PathBuf> {
    match &spec.cli_tool {
        Some(tool) => require(tool),
        None => Err(DriverError::Unsupported(format!("{} does not use a command-line tool.", spec.display_name))),
    }
}

pub async fn run(spec: ProcessSpec<'_>, timeout: Duration) -> DriverResult<ProcessOutput> {
    let name = spec.program.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .envs(spec.env.iter().map(|(key, value)| (*key, value)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let mut child = command
        .spawn()
        .map_err(|e| DriverError::message(format!("Failed to launch {name}: {e}")))?;
    let mut stdin = child.stdin.take();
    let input = spec.stdin.unwrap_or_default();
    tokio::spawn(async move {
        if let Some(pipe) = stdin.as_mut() {
            let _ = pipe.write_all(input.as_bytes()).await;
            let _ = pipe.shutdown().await;
        }
    });
    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| DriverError::TimedOut(format!("running {name} (limit {}s)", timeout.as_secs())))??;
    Ok(ProcessOutput {
        success: output.status.success(),
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

pub async fn run_checked(spec: ProcessSpec<'_>) -> DriverResult<ProcessOutput> {
    let name = spec.program.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let output = run(spec, DEFAULT_TIMEOUT).await?;
    if output.success {
        return Ok(output);
    }
    let detail = output.stderr.trim();
    let out = output.stdout.trim();
    let text = match (detail.is_empty(), out.is_empty()) {
        (true, true) => format!("{name} exited with code {}", output.code.unwrap_or(-1)),
        (true, false) => out.to_string(),
        (false, true) => detail.to_string(),
        (false, false) => format!("{detail}\n\n{out}"),
    };
    Err(DriverError::message(text))
}
