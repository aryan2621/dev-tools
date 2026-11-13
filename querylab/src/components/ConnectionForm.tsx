import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import type { EngineMeta, Profile } from "../types";
import { ChevronRight, FolderOpen, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "../api";
import { attempt } from "../lib/notify";
import { InlineError } from "./InlineError";
import { EngineMark } from "./EngineMark";

interface ConnectionFormProps {
  open: boolean;
  engines: EngineMeta[];
  initial: Profile | null;
  engineKind?: string;
  onClose: () => void;
  onSave: (profile: Profile) => Promise<unknown>;
}

const blankProfile = (engine: EngineMeta): Profile => ({
  id: "",
  name: "",
  engine: engine.kind,
  host: "127.0.0.1",
  port: engine.defaultPort,
  user: "",
  password: "",
  database: "",
  filePath: "",
  uri: "",
  sslMode: engine.defaultSslMode,
  region: "us-east-1",
  awsProfile: "",
  endpointUrl: "",
  options: {},
});

type FieldErrors = Partial<Record<keyof Profile, string>>;

const PORT_MAX = 65535;

function validate(draft: Profile, has: (field: string) => boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (has("file") && !draft.filePath.trim()) errors.filePath = "Choose a database file";
  if (has("uri") && !draft.uri.trim()) errors.uri = "Enter a connection URI";
  if (has("host") && !draft.host.trim()) errors.host = "Enter a host";
  if (has("host") && has("port") && !(draft.port >= 1 && draft.port <= PORT_MAX)) errors.port = `Port must be 1-${PORT_MAX}`;
  return errors;
}

interface FieldProps extends Omit<ComponentProps<typeof Input>, "id"> {
  label: string;
  error?: string;
}

export function Field({ label, error, ...input }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={error ? "border-destructive" : undefined} autoComplete="off" {...input} />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

const groupByCategory = (engines: EngineMeta[]) =>
  engines.reduce<Map<string, EngineMeta[]>>((groups, engine) => groups.set(engine.category, [...(groups.get(engine.category) ?? []), engine]), new Map());

export function ConnectionForm({ open: isOpen, engines, initial, engineKind, onClose, onSave }: ConnectionFormProps) {
  const [draft, setDraft] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const trustId = useId();

  useEffect(() => {
    if (isOpen) {
      const preset = engines.find((candidate) => candidate.kind === engineKind) ?? engines[0];
      setDraft(initial ?? (preset ? blankProfile(preset) : null));
      setError(null);
      setTouched(new Set());
      setAdvancedOpen(false);
    }
  }, [isOpen, initial, engineKind, engines]);

  const engine = engines.find((candidate) => candidate.kind === draft?.engine);
  if (!draft || !engine) return null;

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setDraft({ ...draft, [key]: value });
  const has = (field: string) => engine.fields.includes(field);
  const errors = validate(draft, has);
  const firstError = Object.values(errors)[0];
  const touch = (field: string) => setTouched((current) => new Set(current).add(field));
  const shown = (field: keyof Profile) => (touched.has(field) ? errors[field] : undefined);
  const text = (field: keyof Profile, label: string, type = "text") => (
    <Field label={label} type={type} value={String(draft[field])} error={shown(field)} onBlur={() => touch(field)} onChange={(event) => set(field, event.target.value as never)} />
  );

  const browse = async () => {
    const path = await open({ multiple: false, directory: false });
    if (typeof path === "string") set("filePath", path);
  };

  const test = async () => {
    setTesting(true);
    await attempt(() => api("test_connection", { profile: draft }), "Connection works", "Connection failed");
    setTesting(false);
  };

  const submit = async () => {
    if (firstError) {
      setTouched(new Set(Object.keys(errors)));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setSaving(false);
    }
  };

  const showSsl = has("sslMode") && engine.sslModes.length > 0;
  const showTrust = showSsl || engine.kind === "sqlserver";
  const hasAdvanced = has("awsProfile") || has("endpointUrl") || showTrust || engine.optionFields.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[540px] overflow-y-auto p-5 shadow-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="flex-row items-center gap-3 space-y-0 pr-6">
            <EngineMark engine={engine} className="size-9 rounded-lg [&_svg]:size-4" />
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>{initial ? "Edit connection" : "New connection"}</DialogTitle>
              <DialogDescription>{engine.summary}</DialogDescription>
            </div>
          </DialogHeader>
          {!initial && (
            <SelectField label="Engine" value={draft.engine} onChange={(kind) => setDraft(blankProfile(engines.find((candidate) => candidate.kind === kind) ?? engine))}>
              {[...groupByCategory(engines)].map(([category, members]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{category}</SelectLabel>
                  {members.map((member) => (
                    <SelectItem key={member.kind} value={member.kind}>
                      {member.displayName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectField>
          )}
          {text("name", "Name (optional)")}
          {has("file") && (
            <div className="flex items-end gap-2">
              <div className="flex-1">{text("filePath", "Database file")}</div>
              <Button type="button" variant="outline" onClick={browse}>
                <FolderOpen />
                Browse...
              </Button>
            </div>
          )}
          {has("uri") && text("uri", "Connection URI")}
          {has("host") && (
            <div className="grid grid-cols-[1fr_96px] gap-2">
              {text("host", "Host")}
              {has("port") && (
                <Field label="Port" type="number" value={draft.port || ""} error={shown("port")} onBlur={() => touch("port")} onChange={(event) => set("port", Number(event.target.value))} />
              )}
            </div>
          )}
          {has("user") && text("user", "User")}
          {has("password") && (
            <div className="flex flex-col gap-1">
              {text("password", engine.credentialLabel, "password")}
              <p className="text-[11px] text-muted-foreground">Stored in your OS keychain, never in the profile file.</p>
            </div>
          )}
          {has("database") && text("database", engine.databaseLabel)}
          {has("region") && text("region", "Region")}
          {hasAdvanced && (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight aria-hidden className="size-3 transition-transform duration-100 ease-out data-[open=true]:rotate-90" data-open={advancedOpen} />
                Advanced options
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 flex flex-col gap-3 border-l-2 pl-3">
                {has("awsProfile") && text("awsProfile", "AWS profile (optional)")}
                {has("endpointUrl") && text("endpointUrl", "Endpoint URL (optional)")}
                {showSsl && (
                  <SelectField label={engine.driverKind === "http" ? "Protocol" : "SSL mode"} value={draft.sslMode} onChange={(mode) => set("sslMode", mode)}>
                    {engine.sslModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectField>
                )}
                {showTrust && (
                  <div className="flex items-center gap-2">
                    <Checkbox id={trustId} checked={draft.options.trustServerCert === "true"} onCheckedChange={(checked) => set("options", { ...draft.options, trustServerCert: checked === true ? "true" : "false" })} />
                    <Label htmlFor={trustId} className="text-sm">Trust server certificate (skip TLS verification)</Label>
                  </div>
                )}
                {engine.optionFields.map((field) => (
                  <Field key={field.key} label={field.label} value={draft.options[field.key] ?? ""} onChange={(event) => set("options", { ...draft.options, [field.key]: event.target.value })} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
          {engine.installHint && (
            <Alert>
              <AlertDescription>
                <p>Requires a command-line tool. Install with:</p>
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{engine.installHint}</pre>
              </AlertDescription>
            </Alert>
          )}
          {error && <InlineError message={error} onRetry={submit} />}
          <DialogFooter className="items-center gap-2 border-t pt-3">
            {firstError && (
              <span id="save-disabled-reason" className="mr-auto text-[11px] text-muted-foreground">
                {firstError}
              </span>
            )}
            <Button type="button" variant="outline" onClick={test} disabled={testing || Boolean(firstError)}>
              {testing && <Loader2 className="animate-spin" />}
              Test connection
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || Boolean(firstError)} aria-describedby={firstError ? "save-disabled-reason" : undefined}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving..." : initial ? "Save changes" : "Create connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
