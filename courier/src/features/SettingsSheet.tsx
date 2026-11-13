import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { commands } from "@/commands";
import { Field } from "@/components/Field";
import { OptionSelect } from "@/components/OptionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { attempt } from "@/notify";
import { useAgent } from "./ai/useAgent";
import type { ProviderConfig } from "@/types";

interface ProviderKind {
  label: string;
  needsKey: boolean;
  editsUrl: boolean;
  defaultUrl: string;
  modelHint: string;
}

const PROVIDERS: Record<string, ProviderKind> = {
  claude: {
    label: "Claude",
    needsKey: true,
    editsUrl: false,
    defaultUrl: "",
    modelHint: "claude-sonnet-5-5",
  },
  openai: {
    label: "OpenAI",
    needsKey: true,
    editsUrl: false,
    defaultUrl: "",
    modelHint: "gpt-5",
  },
  gemini: {
    label: "Gemini",
    needsKey: true,
    editsUrl: false,
    defaultUrl: "",
    modelHint: "gemini-2.5-pro",
  },
  ollama: {
    label: "Ollama",
    needsKey: false,
    editsUrl: true,
    defaultUrl: "http://localhost:11434",
    modelHint: "llama3.1",
  },
  compatible: {
    label: "OpenAI-compatible",
    needsKey: true,
    editsUrl: true,
    defaultUrl: "",
    modelHint: "model id",
  },
};

const OPTIONS = Object.entries(PROVIDERS).map(([value, { label }]) => ({
  value,
  label,
}));

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
    setId((current) =>
      settings?.active && PROVIDERS[settings.active]
        ? settings.active
        : current,
    );
  }, [open, settings?.active]);

  useEffect(() => {
    setModel(saved?.model ?? "");
    setBaseUrl(saved?.baseUrl || kind.defaultUrl);
    setKey("");
    setModels([]);
    setModelError(null);
  }, [id, saved?.model, saved?.baseUrl, kind.defaultUrl]);

  const config = (): ProviderConfig => ({
    id,
    model: model.trim(),
    baseUrl: baseUrl.trim(),
  });

  const loadModels = async () => {
    setModelError(null);
    setLoading(true);
    try {
      if (key.trim() && kind.needsKey)
        await commands.saveAiProvider(config(), key.trim());
      const names = await commands.listProviderModels(config());
      setModels(names);
      if (names.length === 0)
        setModelError(
          id === "ollama"
            ? "Ollama is running but has no models. Run: ollama pull qwen2.5:3b"
            : "No models returned.",
        );
    } catch (error) {
      setModels([]);
      const message = error instanceof Error ? error.message : String(error);
      setModelError(
        id === "ollama" && /reach|connect/i.test(message)
          ? "Ollama is not running. Start it and retry."
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const next = await attempt(
      () => commands.saveAiProvider(config(), key.trim() || undefined),
      "Provider saved",
      "Could not save provider",
    );
    if (next) {
      setSettings(next);
      setKey("");
    }
  };

  const activate = async () => {
    const next = await attempt(() => commands.setActiveProvider(id));
    if (next) setSettings(next);
  };

  const active = settings?.active === id;
  const canSave =
    model.trim() !== "" &&
    (!kind.editsUrl || baseUrl.trim() !== "") &&
    (!kind.needsKey || key.trim() !== "" || saved?.hasKey === true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(520px,100vw)] overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Pick the model the assistant uses. Keys are stored in your system
            keychain.
          </SheetDescription>
        </SheetHeader>
        <form
          className="grid content-start gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Provider">
            {(control) => (
              <OptionSelect
                {...control}
                options={OPTIONS}
                value={id}
                onValueChange={setId}
              />
            )}
          </Field>
          {kind.editsUrl && (
            <Field label="Base URL">
              {(control) => (
                <Input
                  {...control}
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="font-mono"
                />
              )}
            </Field>
          )}
          {kind.needsKey && (
            <Field label="API key">
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={
                    saved?.hasKey ? "Saved in keychain. Type to replace." : ""
                  }
                  onChange={(event) => setKey(event.target.value)}
                  className="font-mono"
                />
              )}
            </Field>
          )}
          <Field label="Model" error={modelError ?? undefined}>
            {(control) => (
              <div className="flex gap-2">
                {models.length > 0 ? (
                  <OptionSelect
                    {...control}
                    options={[...new Set([model, ...models])]
                      .filter(Boolean)
                      .map((name) => ({ value: name, label: name }))}
                    value={model}
                    onValueChange={setModel}
                    className="font-mono"
                  />
                ) : (
                  <Input
                    {...control}
                    value={model}
                    placeholder={kind.modelHint}
                    onChange={(event) => setModel(event.target.value)}
                    className="font-mono"
                  />
                )}
                <Button type="button" variant="outline" disabled={loading} onClick={loadModels}>
                  {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {loading ? "Loading" : "Load models"}
                </Button>
              </div>
            )}
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!canSave}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={active || !saved}
              onClick={activate}
            >
              {active ? "Active" : "Use this provider"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
