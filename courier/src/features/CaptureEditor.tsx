import { Wand2 } from "lucide-react";
import { KeyValueTable } from "@/components/KeyValueTable";
import type { KV } from "@/types";

interface CaptureEditorProps {
  captures: KV[];
  onChange: (captures: KV[]) => void;
}

export function CaptureEditor({ captures, onChange }: CaptureEditorProps) {
  return (
    <>
      <p className="flex items-start gap-2 px-4 pt-3 text-sm text-muted-foreground">
        <Wand2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-ink" />
        Save values from a JSON response into the active environment after each send.
      </p>
      <KeyValueTable
        items={captures}
        onChange={onChange}
        keyLabel="Variable"
        valueLabel="JSON path"
        keyHint="token"
        valueHint="data.items.0.id"
      />
    </>
  );
}
