import { KeyRound } from "lucide-react";
import { CheckboxField } from "@/components/CheckboxField";
import { Field } from "@/components/Field";
import { OptionSelect, optionsOf } from "@/components/OptionSelect";
import { Input } from "@/components/ui/input";
import { AUTH_LABELS, type AuthType, type RequestAuth } from "@/types";

interface AuthEditorProps {
  auth: RequestAuth;
  onChange: (auth: RequestAuth) => void;
}

export function AuthEditor({ auth, onChange }: AuthEditorProps) {
  const patch = (change: Partial<RequestAuth>) => onChange({ ...auth, ...change });
  return (
    <div className="grid max-w-md gap-3 p-4">
      <Field label="Type">
        {(control) => (
          <OptionSelect
            {...control}
            options={optionsOf(AUTH_LABELS)}
            value={auth.type}
            onValueChange={(type) => patch({ type: type as AuthType })}
          />
        )}
      </Field>
      {auth.type === "none" && (
        <p className="text-sm text-muted-foreground">This request is sent without authentication.</p>
      )}
      {auth.type === "bearer" && (
        <Field label="Token">
          {(control) => (
            <Input {...control} className="font-mono" type="password" value={auth.token} onChange={(event) => patch({ token: event.target.value })} />
          )}
        </Field>
      )}
      {auth.type === "basic" && (
        <>
          <Field label="Username">
            {(control) => <Input {...control} value={auth.username} onChange={(event) => patch({ username: event.target.value })} />}
          </Field>
          <Field label="Password">
            {(control) => (
              <Input {...control} type="password" value={auth.password} onChange={(event) => patch({ password: event.target.value })} />
            )}
          </Field>
        </>
      )}
      {auth.type === "apiKey" && (
        <>
          <Field label="Key name">
            {(control) => <Input {...control} className="font-mono" value={auth.keyName} onChange={(event) => patch({ keyName: event.target.value })} />}
          </Field>
          <Field label="Key value">
            {(control) => (
              <Input {...control} className="font-mono" type="password" value={auth.keyValue} onChange={(event) => patch({ keyValue: event.target.value })} />
            )}
          </Field>
          <CheckboxField label="Send in query string" checked={auth.keyInQuery} onCheckedChange={(keyInQuery) => patch({ keyInQuery })} />
        </>
      )}
      {auth.type !== "none" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRound aria-hidden="true" className="size-3.5" />
          Secrets are stored in the system keyring.
        </p>
      )}
    </div>
  );
}
