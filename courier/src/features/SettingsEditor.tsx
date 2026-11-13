import { CheckboxField } from "@/components/CheckboxField";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import type { RequestSettings } from "@/types";

interface SettingsEditorProps {
  settings: RequestSettings;
  onChange: (settings: RequestSettings) => void;
}

export function SettingsEditor({ settings, onChange }: SettingsEditorProps) {
  const patch = (change: Partial<RequestSettings>) => onChange({ ...settings, ...change });
  return (
    <div className="grid max-w-md gap-3 p-4">
      <Field label="Timeout (seconds)">
        {(control) => (
          <Input
            {...control}
            type="number"
            min={1}
            value={settings.timeout}
            onChange={(event) => patch({ timeout: Math.max(1, Number(event.target.value) || 1) })}
          />
        )}
      </Field>
      <CheckboxField label="Follow redirects" checked={settings.followRedirects} onCheckedChange={(followRedirects) => patch({ followRedirects })} />
      <CheckboxField
        label="Allow insecure TLS (skip certificate checks)"
        checked={settings.allowInsecureTls}
        onCheckedChange={(allowInsecureTls) => patch({ allowInsecureTls })}
      />
    </div>
  );
}
