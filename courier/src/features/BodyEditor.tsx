import { FileJson } from "lucide-react";
import { commands } from "@/commands";
import { CodeEditor } from "@/components/CodeEditor";
import { KeyValueTable } from "@/components/KeyValueTable";
import { optionsOf } from "@/components/OptionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { attempt } from "@/notify";
import { BODY_LABELS, type BodyType, type RequestBody } from "@/types";

interface BodyEditorProps {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

const formatJson = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const hasJson = (type: BodyType) => type === "json" || type === "graphql";

export function BodyEditor({ body, onChange }: BodyEditorProps) {
  const patch = (change: Partial<RequestBody>) => onChange({ ...body, ...change });
  const chooseFile = async () => {
    const path = await attempt(commands.pickFile, undefined, "Could not open the file picker");
    if (path) patch({ filePath: path });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RadioGroup
        aria-label="Body type"
        orientation="horizontal"
        value={body.type}
        onValueChange={(type) => patch({ type: type as BodyType })}
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2"
      >
        {optionsOf(BODY_LABELS).map((option) => (
          <div key={option.value} className="flex items-center gap-1.5">
            <RadioGroupItem id={`body-${option.value}`} value={option.value} />
            <Label htmlFor={`body-${option.value}`} className="text-sm font-normal text-muted-foreground">
              {option.label}
            </Label>
          </div>
        ))}
        {hasJson(body.type) && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => patch({ raw: formatJson(body.raw) })}>
            Format JSON
          </Button>
        )}
      </RadioGroup>
      <div className="min-h-0 flex-1 overflow-auto">
        {body.type === "none" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground">
              <FileJson aria-hidden="true" className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">No body</p>
              <p className="text-sm text-muted-foreground">Choose a body type above to add content.</p>
            </div>
          </div>
        )}
        {(body.type === "json" || body.type === "text") && (
          <CodeEditor
            label="Request body"
            language={body.type === "json" ? "json" : "plain"}
            value={body.raw}
            onChange={(raw) => patch({ raw })}
          />
        )}
        {body.type === "formUrlEncoded" && <KeyValueTable items={body.formItems} onChange={(formItems) => patch({ formItems })} />}
        {body.type === "multipart" && <KeyValueTable withFiles items={body.formItems} onChange={(formItems) => patch({ formItems })} />}
        {body.type === "binary" && (
          <div className="flex max-w-lg items-center gap-2 px-3">
            <Input readOnly aria-label="File path" value={body.filePath} placeholder="No file chosen" />
            <Button variant="outline" onClick={chooseFile}>
              Choose
            </Button>
          </div>
        )}
        {body.type === "graphql" && (
          <div className="grid h-full grid-rows-[1fr_auto]">
            <CodeEditor label="GraphQL query" value={body.raw} onChange={(raw) => patch({ raw })} />
            <div className="h-40 border-t border-border">
              <p className="px-3 pt-2 text-sm text-muted-foreground">Variables (JSON)</p>
              <CodeEditor
                label="GraphQL variables"
                language="json"
                value={body.graphqlVariables}
                onChange={(graphqlVariables) => patch({ graphqlVariables })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
