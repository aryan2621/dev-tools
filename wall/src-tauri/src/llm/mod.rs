pub mod catalog;
pub mod download;
pub mod hardware;
pub mod llama_server;
pub mod openai_compat;
pub mod provider;

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;

use catalog::{ModelSpec, ModelStore, CATALOG};
use download::{DownloadProgress, Downloader, ProgressSink};
use hardware::Hardware;
use llama_server::Supervisor;
use openai_compat::OpenAiCompatProvider;
use provider::LlmError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelView {
    #[serde(flatten)]
    pub spec: &'static ModelSpec,
    pub installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogView {
    pub ram_gb: u64,
    pub recommended: &'static str,
    pub runtime_available: bool,
    pub running: Option<String>,
    pub download: Option<DownloadProgress>,
    /// The model Wall will use for the next AI request; `None` when nothing is installed.
    pub active: Option<&'static str>,
    pub models: Vec<ModelView>,
}

/// The local AI runtime: model files, downloads and the llama.cpp server process.
pub struct LlmRuntime {
    store: ModelStore,
    downloader: Arc<Downloader>,
    supervisor: Supervisor,
    hardware: Hardware,
}

impl LlmRuntime {
    pub fn new(data_dir: PathBuf, binary: Option<PathBuf>) -> Result<Self, LlmError> {
        let supervisor = Supervisor::new(data_dir.clone(), binary)?;
        Ok(Self {
            store: ModelStore::new(data_dir.join("models")),
            downloader: Arc::new(Downloader::new(download::HUGGING_FACE)?),
            supervisor,
            hardware: hardware::detect(),
        })
    }

    /// Kills a llama-server left behind by a force-quit.
    pub fn stop_leftover_servers(&self) {
        self.supervisor.stop_leftover();
    }

    pub async fn catalog(&self, preferred: Option<&str>) -> CatalogView {
        CatalogView {
            ram_gb: self.hardware.ram_gb,
            recommended: catalog::recommended().id,
            runtime_available: self.supervisor.binary_available(),
            running: self.supervisor.current().await.map(|endpoint| endpoint.model_id),
            download: self.downloader.status(),
            active: self.store.resolve(preferred).map(|spec| spec.id),
            models: CATALOG
                .iter()
                .map(|spec| ModelView { spec, installed: self.store.path(spec.id).is_some() })
                .collect(),
        }
    }

    pub fn download(&self, model_id: &str, sink: ProgressSink) -> Result<(), LlmError> {
        let spec = known(model_id)?;
        if self.store.path(spec.id).is_some() {
            return Err(LlmError::Invalid(format!("{} is already installed", spec.name)));
        }
        self.downloader.start(spec, self.store.own_path(spec.id), sink)
    }

    pub fn cancel_download(&self) {
        self.downloader.cancel();
    }

    /// Loads the preferred (or smallest installed) model into llama-server and returns a provider
    /// bound to it. The server is started on first use and reused afterwards.
    pub async fn provider(&self, preferred: Option<&str>) -> Result<OpenAiCompatProvider, LlmError> {
        let spec = self.store.resolve(preferred).ok_or(LlmError::NoModel)?;
        let path = self.store.path(spec.id).ok_or(LlmError::NoModel)?;
        let endpoint = self.supervisor.ensure(spec.id, &path).await?;
        OpenAiCompatProvider::new(endpoint.base_url, Some(endpoint.api_key), endpoint.model_id)
    }

    pub async fn stop(&self) {
        self.supervisor.stop().await;
    }

    /// Synchronous, for app exit when the async runtime may already be shutting down.
    pub fn shutdown(&self) {
        self.downloader.cancel();
        self.supervisor.kill_now();
    }
}

fn known(model_id: &str) -> Result<&'static ModelSpec, LlmError> {
    catalog::find(model_id).ok_or_else(|| LlmError::Invalid(format!("Unknown model: {model_id}")))
}
