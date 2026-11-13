import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { commands } from "@/commands";
import { attempt } from "@/notify";
import { useCourier } from "@/store";
import {
  type AiSettings,
  type ToolCall,
  type ToolOutput,
  newId,
} from "@/types";
import { type PreviewRow, TOOLS, toolByName } from "./tools";

const MAX_ROUNDS = 12;

const SYSTEM = `You are the assistant inside Courier, a desktop HTTP client. You can inspect and edit the user's requests with tools. Read first, then act. Edits and sends are shown to the user for approval before they run. Be brief and concrete. Never invent secrets; secrets in tool output are masked.`;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  text: string;
}

export interface PendingApproval {
  call: ToolCall;
  rows: PreviewRow[];
  decide: (decision: "approve" | "always" | "deny") => void;
}

interface Agent {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: ChatMessage[];
  live: string;
  busy: boolean;
  pending: PendingApproval | null;
  settings: AiSettings | null;
  setSettings: (settings: AiSettings) => void;
  ready: boolean;
  send: (text: string) => void;
  ask: (text: string) => void;
  stop: () => void;
  clear: () => void;
}

const AgentContext = createContext<Agent | null>(null);

export function useAgent() {
  const value = useContext(AgentContext);
  if (!value) throw new Error("AgentProvider missing");
  return value;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const courier = useCourier();
  const courierRef = useRef(courier);
  courierRef.current = courier;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const history = useRef<unknown[]>([]);
  const always = useRef(new Set<string>());
  const cancelled = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    attempt(() => commands.getAiSettings().then(setSettings));
  }, []);

  const provider = settings?.providers.find(
    (entry) => entry.id === settings.active,
  );
  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    const unlisten = listen<string>("ai-delta", (event) => setLive((current) => current + event.payload));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  const push = useCallback(
    (role: ChatMessage["role"], text: string) =>
      setMessages((current) => [...current, { id: newId(), role, text }]),
    [],
  );

  const execute = useCallback(
    async (call: ToolCall): Promise<string> => {
      const spec = toolByName(call.name);
      if (!spec) return `Unknown tool ${call.name}.`;
      if (spec.needsApproval && !always.current.has(call.name)) {
        const decision = await new Promise<"approve" | "always" | "deny">(
          (resolve) =>
            setPending({
              call,
              rows: spec.preview?.(call.arguments, courierRef.current) ?? [],
              decide: resolve,
            }),
        );
        setPending(null);
        if (decision === "deny") {
          push("tool", `${call.name} declined`);
          return "The user declined this action.";
        }
        if (decision === "always") always.current.add(call.name);
      }
      try {
        const output = await spec.run(call.arguments, courierRef.current);
        push("tool", call.name);
        return typeof output === "string" ? output : JSON.stringify(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        push("error", `${call.name} failed: ${message}`);
        return `Error: ${message}`;
      }
    },
    [push],
  );

  const run = useCallback(
    async (text: string) => {
      const active = providerRef.current;
      if (!active || busyRef.current) return;
      busyRef.current = true;
      cancelled.current = false;
      setBusy(true);
      const defs = TOOLS.map((tool) => tool.def);
      let input = text;
      let results: ToolOutput[] = [];
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const step = await commands.aiStep(
            active,
            history.current,
            input,
            results,
            defs,
            SYSTEM,
          );
          setLive("");
          if (!step || cancelled.current) return;
          history.current = step.history;
          if (step.text) push("assistant", step.text);
          if (step.calls.length === 0) return;
          results = [];
          for (const call of step.calls) {
            if (cancelled.current) return;
            results.push({ id: call.id, content: await execute(call) });
          }
          input = "";
        }
        push("error", `Stopped after ${MAX_ROUNDS} steps.`);
      } catch (error) {
        push("error", error instanceof Error ? error.message : String(error));
      } finally {
        setLive("");
        busyRef.current = false;
        setBusy(false);
      }
    },
    [execute, push],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !providerRef.current) return;
      push("user", trimmed);
      run(trimmed);
    },
    [push, run],
  );

  const ask = useCallback(
    (text: string) => {
      setOpen(true);
      send(text);
    },
    [send],
  );

  const stop = useCallback(() => {
    cancelled.current = true;
    setPending((current) => {
      current?.decide("deny");
      return null;
    });
    commands.aiCancel();
  }, []);

  const clear = useCallback(() => {
    stop();
    history.current = [];
    setMessages([]);
  }, [stop]);

  const value = useMemo<Agent>(
    () => ({
      open,
      setOpen,
      messages,
      live,
      busy,
      pending,
      settings,
      setSettings,
      ready: provider !== undefined,
      send,
      ask,
      stop,
      clear,
    }),
    [open, messages, live, busy, pending, settings, provider, send, ask, stop, clear],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}
