use std::path::PathBuf;

use serde::Serialize;

/// An open GGUF model the bundled llama.cpp runs (4-bit, Unsloth builds).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpec {
    pub id: &'static str,
    pub name: &'static str,
    #[serde(skip)]
    pub repo: &'static str,
    #[serde(skip)]
    pub file: &'static str,
    pub size_mb: u64,
    pub min_ram_gb: u64,
    pub note: &'static str,
}

/// Ordered weakest (fastest) to strongest.
pub const CATALOG: [ModelSpec; 3] = [
    ModelSpec {
        id: "qwen3.5-4b",
        name: "Qwen3.5 4B",
        repo: "unsloth/Qwen3.5-4B-GGUF",
        file: "Qwen3.5-4B-Q4_K_M.gguf",
        size_mb: 2740,
        min_ram_gb: 8,
        note: "Small and quick. Best for snappy command suggestions.",
    },
    ModelSpec {
        id: "qwen3.5-9b",
        name: "Qwen3.5 9B",
        repo: "unsloth/Qwen3.5-9B-GGUF",
        file: "Qwen3.5-9B-Q4_K_M.gguf",
        size_mb: 5680,
        min_ram_gb: 16,
        note: "Better at tricky commands and error explanations. Slower to answer.",
    },
    ModelSpec {
        id: "gemma-4-12b",
        name: "Gemma 4 12B",
        repo: "unsloth/gemma-4-12B-it-qat-GGUF",
        file: "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf",
        size_mb: 6720,
        min_ram_gb: 16,
        note: "Google's model. A good second opinion next to Qwen.",
    },
];

pub fn find(id: &str) -> Option<&'static ModelSpec> {
    CATALOG.iter().find(|model| model.id == id)
}

/// The model to download first: the small one, for latency.
pub fn recommended() -> &'static ModelSpec {
    &CATALOG[0]
}

/// Where GGUF files live: Wall's own models folder only.
pub struct ModelStore {
    dir: PathBuf,
}

impl ModelStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// Where a download for `id` is written.
    pub fn own_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.gguf"))
    }

    pub fn path(&self, id: &str) -> Option<PathBuf> {
        Some(self.own_path(id)).filter(|path| path.is_file())
    }

    /// The chosen model if installed, else the smallest installed one (lowest latency).
    pub fn resolve(&self, requested: Option<&str>) -> Option<&'static ModelSpec> {
        requested
            .and_then(find)
            .filter(|model| self.path(model.id).is_some())
            .or_else(|| CATALOG.iter().find(|model| self.path(model.id).is_some()))
    }
}
