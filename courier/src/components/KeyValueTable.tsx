import { Plus, Rows3, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { commands } from "@/commands";
import { attempt } from "@/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type KV, newKV } from "@/types";
import { IconAction } from "./IconAction";

interface KeyValueTableProps {
  items: KV[];
  onChange: (items: KV[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  keyHint?: string;
  valueHint?: string;
  withFiles?: boolean;
}

const DISABLED_PREFIX = "//";

const toBulkText = (items: KV[]) =>
  items.map((item) => `${item.enabled ? "" : DISABLED_PREFIX}${item.key}: ${item.value}`).join("\n");

function fromBulkText(text: string, items: KV[]): KV[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      const enabled = !line.startsWith(DISABLED_PREFIX);
      const body = enabled ? line : line.slice(DISABLED_PREFIX.length);
      const colon = body.indexOf(":");
      const key = (colon < 0 ? body : body.slice(0, colon)).trim();
      const value = colon < 0 ? "" : body.slice(colon + 1).trim();
      return { ...(items[index] ?? newKV()), enabled, key, value };
    });
}

const cellInput = "h-7 border-transparent bg-transparent px-1.5 font-mono text-sm shadow-none hover:border-input";

export function KeyValueTable({
  items,
  onChange,
  keyLabel = "Key",
  valueLabel = "Value",
  keyHint,
  valueHint,
  withFiles,
}: KeyValueTableProps) {
  const [bulkText, setBulkText] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const patch = (id: string, change: Partial<KV>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const chooseFile = async (id: string) => {
    const path = await attempt(commands.pickFile, undefined, "Could not open the file picker");
    if (path) patch(id, { filePath: path });
  };

  const add = () => {
    const created = newKV();
    setFocusId(created.id);
    onChange([...items, created]);
  };

  const toolbar = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={add} disabled={bulkText !== null}>
        <Plus aria-hidden="true" />
        Add row
      </Button>
      {!withFiles && (
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={bulkText !== null}
          className={cn(bulkText !== null && "bg-accent text-foreground")}
          onClick={() => setBulkText(bulkText === null ? toBulkText(items) : null)}
        >
          {bulkText === null ? <Rows3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
          {bulkText === null ? "Bulk edit" : "Table view"}
        </Button>
      )}
    </div>
  );

  if (bulkText !== null) {
    return (
      <div className="grid gap-2 p-3">
        {toolbar}
        <Textarea
          aria-label={`${keyLabel} and ${valueLabel}, one per line`}
          spellCheck={false}
          className="min-h-40 font-mono text-sm"
          value={bulkText}
          onChange={(event) => {
            setBulkText(event.target.value);
            onChange(fromBulkText(event.target.value, items));
          }}
        />
        <p className="text-sm text-muted-foreground">
          One row per line as {keyLabel.toLowerCase()}: {valueLabel.toLowerCase()}. Start a line with // to disable it.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 p-3">
      {toolbar}
      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No rows yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table aria-label={`${keyLabel} and ${valueLabel}`}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-9">
                  <span className="sr-only">Enabled</span>
                </TableHead>
                <TableHead>{keyLabel}</TableHead>
                {withFiles && <TableHead className="w-24">Type</TableHead>}
                <TableHead>{valueLabel}</TableHead>
                <TableHead className="w-9">
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isFile = withFiles && item.isFile;
                return (
                  <TableRow key={item.id} data-state={item.enabled ? undefined : "disabled"} className="group/row data-[state=disabled]:opacity-60">
                    <TableCell className="w-9 py-0.5">
                      <Checkbox
                        checked={item.enabled}
                        onCheckedChange={(enabled) => patch(item.id, { enabled: enabled === true })}
                        aria-label={`Enable ${item.key || "row"}`}
                      />
                    </TableCell>
                    <TableCell className="py-0.5">
                      <Input
                        value={item.key}
                        aria-label={keyLabel}
                        placeholder={keyHint}
                        autoFocus={item.id === focusId}
                        spellCheck={false}
                        autoComplete="off"
                        className={cellInput}
                        onChange={(event) => patch(item.id, { key: event.target.value })}
                      />
                    </TableCell>
                    {withFiles && (
                      <TableCell className="w-24 py-0.5">
                        <Select
                          value={isFile ? "file" : "text"}
                          onValueChange={(kind) => patch(item.id, { isFile: kind === "file", filePath: "", value: "" })}
                        >
                          <SelectTrigger aria-label="Value type" className="h-7 border-transparent hover:border-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="file">File</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell className="py-0.5">
                      {isFile ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <Input readOnly value={item.filePath} aria-label="File path" placeholder="No file chosen" className={cellInput} />
                          <Button variant="outline" size="sm" onClick={() => chooseFile(item.id)}>
                            Choose
                          </Button>
                        </div>
                      ) : (
                        <Input
                          value={item.value}
                          aria-label={valueLabel}
                          placeholder={valueHint}
                          spellCheck={false}
                          autoComplete="off"
                          className={cellInput}
                          onChange={(event) => patch(item.id, { value: event.target.value })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="w-9 py-0.5">
                      <IconAction
                        icon={Trash2}
                        label={`Remove ${item.key || "row"}`}
                        className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                        onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
