import { useId, useState } from "react";
import { KeyRound, Check, Save, LoaderCircle } from "lucide-react";
import { api } from "./api";
import { AI_NOTE, providers, type Provider } from "./types";
export default function Providers({
  configured,
  onSave,
  onError,
}: {
  configured: Provider[];
  onSave: (p: Provider) => void;
  onError: (e: unknown) => void;
}) {
  const [selected, setSelected] = useState("claude");
  return (
    <div className="provider-layout">
      <div className="provider-list">
        {providers.map((p) => (
          <button
            className={`provider-option ${selected === p.id ? "active" : ""}`}
            key={p.id}
            onClick={() => setSelected(p.id)}
          >
            <div className={`provider-icon ${p.id}`}>{p.name[0]}</div>
            <div>
              <strong>{p.name}</strong>
              <span>{p.detail}</span>
            </div>
            {configured.some((c) => c.id === p.id) && <Check size={15} />}
          </button>
        ))}
      </div>
      <ProviderForm
        key={selected}
        id={selected}
        initial={configured.find((p) => p.id === selected)}
        onSave={onSave}
        onError={onError}
      />
    </div>
  );
}
type ParamKey = "temperature" | "topP" | "maxTokens" | "numCtx";
const PARAMS: {
  key: ParamKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  ollamaOnly?: boolean;
}[] = [
  {
    key: "temperature",
    label: "Temperature",
    hint: "Lower is more precise. Around 0.2 suits tool use.",
    min: 0,
    max: 2,
    step: 0.1,
    fallback: 1,
  },
  {
    key: "topP",
    label: "Top P",
    hint: "Leave empty unless you tune it instead of temperature.",
    min: 0,
    max: 1,
    step: 0.05,
    fallback: 1,
  },
  {
    key: "maxTokens",
    label: "Max output tokens",
    hint: "Caps the length of each reply.",
    min: 256,
    max: 32768,
    step: 256,
    fallback: 4096,
  },
  {
    key: "numCtx",
    label: "Context window",
    hint: "Tokens the model can see. Ollama defaults to 4096; use 16384 or more with many tools.",
    min: 2048,
    max: 65536,
    step: 1024,
    fallback: 4096,
    ollamaOnly: true,
  },
];
function ParamSlider({
  field,
  value,
  onChange,
}: {
  field: (typeof PARAMS)[number];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const isDefault = value === "";
  return (
    <div className="param-slider">
      <div className="param-slider-head">
        <label htmlFor={id}>{field.label}</label>
        <output htmlFor={id}>{isDefault ? "Default" : value}</output>
        <button
          type="button"
          className="button"
          disabled={isDefault}
          onClick={() => onChange("")}
        >
          Reset
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={isDefault ? field.fallback : Number(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="hint">{field.hint}</span>
    </div>
  );
}
function ProviderForm({
  id,
  initial,
  onSave,
  onError,
}: {
  id: string;
  initial?: Provider;
  onSave: (p: Provider) => void;
  onError: (e: unknown) => void;
}) {
  const kind = providers.find((p) => p.id === id)!;
  const [model, setModel] = useState(initial?.model ?? ""),
    [baseUrl, setBaseUrl] = useState(initial?.baseUrl || kind.defaultUrl),
    [key, setKey] = useState(""),
    [models, setModels] = useState<string[]>([]),
    [modelError, setModelError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [tab, setTab] = useState<"basic" | "advanced">("basic"),
    [params, setParams] = useState<Record<ParamKey, string>>({
      temperature: initial?.temperature?.toString() ?? "",
      topP: initial?.topP?.toString() ?? "",
      maxTokens: initial?.maxTokens?.toString() ?? "",
      numCtx: initial?.numCtx?.toString() ?? "",
    });
  const number = (key: ParamKey) => {
    const value = Number(params[key]);
    return params[key].trim() && Number.isFinite(value) ? value : null;
  };
  const config = (): Provider => ({
    id,
    model: model.trim(),
    baseUrl: baseUrl.trim(),
    temperature: number("temperature"),
    topP: number("topP"),
    maxTokens: number("maxTokens"),
    numCtx: id === "ollama" ? number("numCtx") : null,
  });
  const edit = (change: () => void) => {
    change();
    setSaved(false);
  };
  const loadModels = async () => {
    setModelError("");
    setLoading(true);
    try {
      if (key.trim() && kind.needsKey)
        await api("save_provider", { provider: config(), key: key.trim() });
      const names = await api<string[]>("list_provider_models", {
        provider: config(),
      });
      setModels(names);
      if (!model.trim() && names.length) setModel(names[0]);
      if (!names.length)
        setModelError(
          id === "ollama"
            ? "Ollama is running but has no models. Run: ollama pull llama3.1"
            : "No models returned.",
        );
    } catch (e) {
      setModels([]);
      const message = String(e);
      setModelError(
        id === "ollama" && /reach|connect/i.test(message)
          ? "Ollama is not running. Start it and retry."
          : message,
      );
    } finally {
      setLoading(false);
    }
  };
  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api("save_provider", {
        provider: config(),
        key: clear ? "" : key || null,
      });
      setKey("");
      setSaved(true);
      onSave(config());
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel provider-form">
      <div className="provider-form-title">
        <h3>{kind.name}</h3>
        <p>
          Your messages, the tools you enable and their results are sent to this
          provider.
        </p>
      </div>
      <div className="tab-buttons provider-tabs" role="tablist">
        {(["basic", "advanced"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "advanced" && (
        <div className="provider-advanced-grid">
          {PARAMS.filter((field) => !field.ollamaOnly || id === "ollama").map(
            (field) => (
              <ParamSlider
                key={field.key}
                field={field}
                value={params[field.key]}
                onChange={(value) =>
                  edit(() => setParams({ ...params, [field.key]: value }))
                }
              />
            ),
          )}
        </div>
      )}
      {tab === "basic" && kind.editsUrl && (
        <label>
          Base URL
          <input
            value={baseUrl}
            onChange={(e) => edit(() => setBaseUrl(e.target.value))}
          />
        </label>
      )}
      {tab === "basic" && (kind.needsKey || id === "compatible") && (
        <label>
          API key{kind.needsKey ? "" : " (optional)"}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              initial
                ? "Leave blank to keep the saved key"
                : "Paste your API key"
            }
            value={key}
            onChange={(e) => edit(() => setKey(e.target.value))}
          />
        </label>
      )}
      {tab === "basic" && (
        <label>
          Model
          <div className="provider-model">
            {models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => edit(() => setModel(e.target.value))}
              >
                {[...new Set([model, ...models])]
                  .filter(Boolean)
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                placeholder={kind.modelHint}
                value={model}
                onChange={(e) => edit(() => setModel(e.target.value))}
              />
            )}
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={loadModels}
            >
              {loading && <LoaderCircle size={14} className="spin" />}
              {loading ? "Loading" : "Load models"}
            </button>
          </div>
          {modelError && <span className="hint error">{modelError}</span>}
        </label>
      )}
      {tab === "basic" && (
        <div className="notice">
          <KeyRound size={15} />
          <span>
            Keys are stored in your system keychain, never in Relay’s files.{" "}
            {AI_NOTE}
          </span>
        </div>
      )}
      <div className="provider-actions">
        {initial && (kind.needsKey || id === "compatible") && (
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => save(true)}
          >
            Remove saved key
          </button>
        )}
        <button
          className="button primary"
          disabled={
            busy ||
            !model.trim() ||
            (kind.editsUrl && !baseUrl.trim()) ||
            (kind.needsKey && !initial && !key.trim())
          }
          onClick={() => save()}
        >
          {saved ? <Check size={15} /> : <Save size={15} />}{" "}
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </section>
  );
}
