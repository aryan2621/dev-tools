import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { Field, SelectField } from "@/components/ConnectionForm";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { attempt } from "@/lib/notify";
import type { AiSettings, ProviderConfig } from "@/types";
import { useAgent } from "./useAgent";

interface ProviderKind {
  label: string;
  needsKey: boolean;
  editsUrl: boolean;
  defaultUrl: string;
  modelHint: string;
}

const PROVIDERS: Record<string, ProviderKind> = {
  claude: { label: "Claude", needsKey: true, editsUrl: false, defaultUrl: "", modelHint: "claude-sonnet-5-5" },
  openai: { label: "OpenAI", needsKey: true, editsUrl: false, defaultUrl: "", modelHint: "gpt-5" },
  gemini: { label: "Gemini", needsKey: true, editsUrl: false, defaultUrl: "", modelHint: "gemini-2.5-pro" },
  ollama: { label: "Ollama", needsKey: false, editsUrl: true, defaultUrl: "http://localhost:11434", modelHint: "llama3.1" },
  compatible: { label: "OpenAI-compatible", needsKey: true, editsUrl: true, defaultUrl: "", modelHint: "model id" },
};

const errorText = (error: unknown) => (typeof error === "string" ? error : error instanceof Error ? error.message : String(error));

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { settings, setSettings } = useAgent();
  const [id, setId] = useState("claude");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = PROVIDERS[id];
  const saved = settings?.providers.find((provider) => provider.id === id);

  useEffect(() => {
    if (!open) return;
    setId((current) => (settings?.active && PROVIDERS[settings.active] ? settings.active : current));
  }, [open, settings?.active]);

  useEffect(() => {
    setModel(saved?.model ?? "");
    setBaseUrl(saved?.baseUrl || kind.defaultUrl);
    setKey("");
    setModels([]);
    setModelError(null);
  }, [id, saved?.model, saved?.baseUrl, kind.defaultUrl]);

  const config = (): ProviderConfig => ({ id, model: model.trim(), baseUrl: baseUrl.trim() });

  const loadModels = async () => {
    setModelError(null);
    setLoading(true);
    try {
      if (key.trim() && kind.needsKey) await api("save_ai_provider", { provider: config(), key: key.trim() });
      const names = await api<string[]>("list_provider_models", { provider: config() });
      setModels(names);
      if (names.length === 0) setModelError(id === "ollama" ? "Ollama is running but has no models. Run: ollama pull llama3.1" : "No models returned.");
    } catch (error) {
      setModels([]);
      const message = errorText(error);
      setModelError(id === "ollama" && /reach|connect/i.test(message) ? "Ollama is not running. Start it and retry." : message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const next = await attempt(() => api<AiSettings>("save_ai_provider", { provider: config(), key: key.trim() || null }), "Provider saved", "Could not save provider");
    if (next) {
      setSettings(next);
      setKey("");
    }
  };

  const activate = async () => {
    const next = await attempt(() => api<AiSettings>("set_active_provider", { id }), undefined, "Could not switch provider");
    if (next) setSettings(next);
  };

  const active = settings?.active === id;
  const canSave = model.trim() !== "" && (!kind.editsUrl || baseUrl.trim() !== "") && (!kind.needsKey || key.trim() !== "" || saved?.hasKey === true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[min(520px,100vw)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <SheetHeader className="space-y-0.5 border-b border-border p-4 pr-12">
          <SheetTitle className="text-base">AI settings</SheetTitle>
          <SheetDescription>Pick the model the assistant uses. Keys are stored in your system keychain.</SheetDescription>
        </SheetHeader>
        <form
          className="grid content-start gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SelectField label="Provider" value={id} onChange={setId}>
            {Object.entries(PROVIDERS).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectField>
          {kind.editsUrl && <Field label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="font-mono" />}
          {kind.needsKey && (
            <Field
              label="API key"
              type="password"
              value={key}
              placeholder={saved?.hasKey ? "Saved in keychain. Type to replace." : ""}
              onChange={(event) => setKey(event.target.value)}
              className="font-mono"
            />
          )}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {models.length > 0 ? (
                <SelectField label="Model" value={model} onChange={setModel}>
                  {[...new Set([model, ...models])].filter(Boolean).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectField>
              ) : (
                <Field label="Model" error={modelError ?? undefined} value={model} placeholder={kind.modelHint} onChange={(event) => setModel(event.target.value)} className="font-mono" />
              )}
            </div>
            <Button type="button" variant="outline" disabled={loading} onClick={loadModels}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              {loading ? "Loading" : "Load models"}
            </Button>
          </div>
          {models.length > 0 && modelError && <p className="text-xs text-destructive">{modelError}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!canSave}>
              Save
            </Button>
            <Button type="button" variant="outline" disabled={active || !saved} onClick={activate}>
              {active ? "Active" : "Use this provider"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
