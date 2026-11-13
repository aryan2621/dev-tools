import { ChevronDown, CircleAlert, Send, Square } from "lucide-react";
import { useState } from "react";
import { commands } from "@/commands";
import { CodeEditor } from "@/components/CodeEditor";
import { CountTrigger } from "@/components/CountTrigger";
import { KeyValueTable } from "@/components/KeyValueTable";
import { methodTone } from "@/components/MethodBadge";
import { OptionSelect } from "@/components/OptionSelect";
import { Shortcut } from "@/components/Shortcut";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { attempt, copyWithToast } from "@/notify";
import { modSymbol } from "@/platform";
import { urlWithParams, withUrl } from "@/query";
import { useCourier } from "@/store";
import { enabledPairs, locate } from "@/tree";
import {
  CODE_LABELS,
  METHODS,
  type CodeTarget,
  type SavedRequest,
} from "@/types";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { CaptureEditor } from "./CaptureEditor";
import { SettingsEditor } from "./SettingsEditor";
import { useRequestChecks } from "./useRequestChecks";
import { VariableChips } from "./VariableChips";

const METHOD_OPTIONS = METHODS.map((method) => ({
  value: method,
  label: method,
}));
const variableSource = (request: SavedRequest) =>
  [
    request.url,
    ...request.headers
      .filter((item) => item.enabled)
      .map((item) => `${item.key} ${item.value}`),
    ...request.body.formItems
      .filter((item) => item.enabled)
      .map((item) => `${item.key} ${item.value}`),
    request.body.raw,
  ].join("\n");

const CURL_PREFIX = /^\s*curl\s/i;

interface GeneratedCode {
  target: CodeTarget;
  text: string;
}

export function RequestEditor({ request }: { request: SavedRequest }) {
  const { updateRequest, send, cancel, sending, variables, collections } =
    useCourier();
  const located = locate(collections, request.id);
  const [code, setCode] = useState<GeneratedCode | null>(null);
  const { unresolved, blocker } = useRequestChecks(request, variables);
  const busy = sending[request.id] === true;

  const patch = (change: Partial<SavedRequest>) =>
    updateRequest(request.id, (current) => ({ ...current, ...change }));

  const changeUrl = async (url: string) => {
    const imported = CURL_PREFIX.test(url)
      ? await commands.parseCurl(url)
      : null;
    if (imported)
      updateRequest(request.id, (current) =>
        withUrl(
          { ...imported, id: current.id, name: current.name },
          imported.url,
        ),
      );
    else updateRequest(request.id, (current) => withUrl(current, url));
  };

  const showCode = async (target: CodeTarget) => {
    const text = await attempt(
      () => commands.generateCode(target, request, variables),
      undefined,
      "Could not generate code",
    );
    if (text !== undefined) setCode({ target, text });
  };

  return (
    <section aria-label="Request" className="flex h-full min-h-0 flex-col">
      <div className="grid gap-1.5 border-b border-border px-4 pb-3 pt-2">
        <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          {located && (
            <span className="max-w-[40%] shrink-0 truncate">
              {located.collection.name}
              {located.folder && ` / ${located.folder.name}`} /
            </span>
          )}
          <Input
            aria-label="Request name"
            value={request.name}
            onChange={(event) => patch({ name: event.target.value })}
            className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-base font-semibold text-foreground shadow-none hover:border-input"
          />
        </div>
        <div className="flex overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring/40">
          <OptionSelect
            aria-label="Method"
            className={cn(
              "h-9 w-[104px] shrink-0 rounded-none border-0 border-r border-input bg-muted/50 font-mono font-semibold shadow-none focus:ring-0 focus:ring-offset-0",
              methodTone(request.method).text,
            )}
            options={METHOD_OPTIONS}
            value={request.method}
            onValueChange={(method) =>
              patch({ method: method as SavedRequest["method"] })
            }
          />
          <Input
            id="request-url"
            aria-label="URL"
            className="h-9 rounded-none border-0 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://api.example.com or paste a curl command"
            value={request.url}
            onChange={(event) => changeUrl(event.target.value)}
          />
          {busy ? (
            <Button
              variant="destructive"
              className="h-9 rounded-none"
              onClick={() => cancel(request.id)}
            >
              <Square aria-hidden="true" />
              Cancel
            </Button>
          ) : (
            <div className="flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-9 rounded-none"
                    disabled={blocker !== null}
                    aria-describedby={blocker ? "send-blocker" : undefined}
                    onClick={() => send(request.id)}
                  >
                    <Send aria-hidden="true" />
                    Send
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-2">
                  Send request
                  <Shortcut keys={[modSymbol, "Enter"]} />
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    aria-label="More send options"
                    className="h-9 rounded-none border-l border-primary-foreground/25"
                  >
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                    Copy as code
                  </DropdownMenuLabel>
                  {(Object.keys(CODE_LABELS) as CodeTarget[]).map((target) => (
                    <DropdownMenuItem
                      key={target}
                      onSelect={() => showCode(target)}
                    >
                      {CODE_LABELS[target]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <VariableChips text={variableSource(request)} variables={variables} />
        {blocker && (
          <Alert variant="destructive" id="send-blocker">
            <CircleAlert aria-hidden="true" />
            <span>{blocker}</span>
          </Alert>
        )}
        {unresolved.length > 0 && (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <span>
              Unresolved variables:{" "}
              {unresolved.map((name) => `{{${name}}}`).join(", ")}
            </span>
          </Alert>
        )}
      </div>
      <Tabs defaultValue="params" className="flex min-h-0 flex-1 flex-col">
        <TabsList
          aria-label="Request sections"
          className="h-auto shrink-0 border-b border-border px-3"
        >
          <CountTrigger
            value="params"
            label="Params"
            count={enabledPairs(request.params).length}
          />
          <CountTrigger
            value="headers"
            label="Headers"
            count={enabledPairs(request.headers).length}
          />
          <CountTrigger
            value="auth"
            label="Auth"
            count={request.auth.type === "none" ? 0 : 1}
          />
          <CountTrigger
            value="body"
            label="Body"
            count={request.body.type === "none" ? 0 : 1}
          />
          <CountTrigger
            value="capture"
            label="Capture"
            count={enabledPairs(request.captures).length}
          />
          <CountTrigger value="settings" label="Settings" />
        </TabsList>
        <TabsContent
          value="params"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <KeyValueTable
            items={request.params}
            onChange={(params) =>
              patch({ params, url: urlWithParams(request.url, params) })
            }
            keyHint="page"
            valueHint="1"
          />
        </TabsContent>
        <TabsContent
          value="headers"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <KeyValueTable
            items={request.headers}
            onChange={(headers) => patch({ headers })}
            keyHint="Accept"
            valueHint="application/json"
          />
        </TabsContent>
        <TabsContent value="auth" className="mt-0 min-h-0 flex-1 overflow-auto">
          <AuthEditor
            auth={request.auth}
            onChange={(auth) => patch({ auth })}
          />
        </TabsContent>
        <TabsContent value="body" className="mt-0 min-h-0 flex-1 overflow-auto">
          <BodyEditor
            body={request.body}
            onChange={(body) => patch({ body })}
          />
        </TabsContent>
        <TabsContent
          value="capture"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <CaptureEditor
            captures={request.captures}
            onChange={(captures) => patch({ captures })}
          />
        </TabsContent>
        <TabsContent
          value="settings"
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          <SettingsEditor
            settings={request.settings}
            onChange={(settings) => patch({ settings })}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={code !== null}
        onOpenChange={(open) => !open && setCode(null)}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              Copy as {code ? CODE_LABELS[code.target] : "code"}
            </DialogTitle>
          </DialogHeader>
          <div className="h-72">
            <CodeEditor label="Generated code" value={code?.text ?? ""} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => code && copyWithToast(code.text, "Code copied")}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
