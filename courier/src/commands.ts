import { api } from "./api";
import type {
  AiSettings,
  AiStep,
  ApiResponse,
  CodeTarget,
  HistoryEntry,
  KV,
  ProviderConfig,
  SavedRequest,
  Snapshot,
  ToolDef,
  ToolOutput,
} from "./types";

export const commands = {
  loadState: () => api<Snapshot>("load_state"),
  saveState: (snapshot: Snapshot) => api<void>("save_state", { snapshot }),
  listHistory: () => api<HistoryEntry[]>("list_history"),
  clearHistory: () => api<void>("clear_history"),
  sendRequest: (request: SavedRequest, variables: KV[]) =>
    api<ApiResponse | null>("send_request", { request, variables }),
  cancelRequest: (requestId: string) => api<void>("cancel_request", { requestId }),
  saveResponse: (requestId: string, fileName: string) =>
    api<void>("save_response", { requestId, fileName }),
  unresolvedVariables: (request: SavedRequest, variables: KV[]) =>
    api<string[]>("unresolved_variables", { request, variables }),
  sendBlocker: (request: SavedRequest) => api<string | null>("send_blocker", { request }),
  generateCode: (target: CodeTarget, request: SavedRequest, variables: KV[]) =>
    api<string>("generate_code", { target, request, variables }),
  parseCurl: (text: string) => api<SavedRequest | null>("parse_curl", { text }),
  getAiSettings: () => api<AiSettings>("get_ai_settings"),
  saveAiProvider: (provider: ProviderConfig, key?: string) =>
    api<AiSettings>("save_ai_provider", { provider, key: key ?? null }),
  setActiveProvider: (id: string) => api<AiSettings>("set_active_provider", { id }),
  listProviderModels: (provider: ProviderConfig) => api<string[]>("list_provider_models", { provider }),
  aiStep: (
    provider: ProviderConfig,
    history: unknown[],
    input: string,
    results: ToolOutput[],
    tools: ToolDef[],
    system: string,
  ) => api<AiStep | null>("ai_step", { provider, history, input, results, tools, system }),
  aiCancel: () => api<void>("ai_cancel"),
  pickFile: () => api<string | null>("pick_file"),
};
