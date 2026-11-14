import { api } from "@/api";
import { searchHistory } from "@/lib/format";
import type { QueryDraft } from "@/lib/templates";
import type { HistoryEntry, Profile, QueryResult, QueryTab, RunOutcome, SchemaInfo, ToolDef } from "@/types";

export interface PreviewRow {
  field: string;
  before?: string;
  after: string;
}

export interface ToolContext {
  profiles: Profile[];
  connectedIds: string[];
  activeTab: QueryTab | undefined;
  newTab: (profileId: string, draft?: QueryDraft) => void;
  patchTab: (id: string, patch: Partial<QueryTab>) => void;
  run: (tab: QueryTab, selection: string) => Promise<RunOutcome>;
}

export interface ToolSpec {
  def: ToolDef;
  needsApproval: boolean;
  preview?: (args: Record<string, unknown>, ctx: ToolContext) => PreviewRow[];
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const SAMPLE_ROWS = 20;
const SCHEMA_OBJECT_LIMIT = 200;
const HISTORY_LIMIT = 15;
const DESTRUCTIVE = /\b(drop|truncate|delete|update|alter|insert|create|replace|merge|grant|revoke|flushall|flushdb|del)\b/i;

const text = (args: Record<string, unknown>, key: string) => String(args[key] ?? "");

const profileOf = (ctx: ToolContext, args: Record<string, unknown>) => {
  const wanted = text(args, "connection").toLowerCase();
  if (!wanted) return ctx.activeTab ? ctx.profiles.find((profile) => profile.id === ctx.activeTab?.profileId) : undefined;
  return ctx.profiles.find((profile) => profile.id === args.connection || profile.name.toLowerCase() === wanted);
};

const requireProfile = (ctx: ToolContext, args: Record<string, unknown>) => {
  const profile = profileOf(ctx, args);
  if (!profile) throw new Error("Unknown connection. Call list_connections first.");
  return profile;
};

const requireConnected = (ctx: ToolContext, args: Record<string, unknown>) => {
  const profile = requireProfile(ctx, args);
  if (!ctx.connectedIds.includes(profile.id)) throw new Error(`${profile.name} is not connected. Ask the user to connect it.`);
  return profile;
};

const requireTab = (ctx: ToolContext) => {
  if (!ctx.activeTab) throw new Error("No query tab is open.");
  return ctx.activeTab;
};

const trimResult = (result: QueryResult) => ({
  columns: result.columns,
  rows: result.rows.slice(0, SAMPLE_ROWS),
  totalRows: result.rows.length,
  truncated: result.truncated || result.rows.length > SAMPLE_ROWS,
  affectedRows: result.affectedRows,
  message: result.message,
  durationMs: result.durationMs,
});

const connectionParam = {
  connection: { type: "string", description: "Connection name or id. Defaults to the active tab's connection." },
};

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOLS: ToolSpec[] = [
  {
    def: {
      name: "list_connections",
      description: "List saved connections with engine and whether each is connected.",
      parameters: object({}),
    },
    needsApproval: false,
    run: async (_args, ctx) =>
      ctx.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        engine: profile.engine,
        database: profile.database,
        connected: ctx.connectedIds.includes(profile.id),
      })),
  },
  {
    def: {
      name: "get_schema",
      description: "Get tables and columns of a connected database.",
      parameters: object(connectionParam),
    },
    needsApproval: false,
    run: async (args, ctx) => {
      const profile = requireConnected(ctx, args);
      const schema = await api<SchemaInfo>("schema", { id: profile.id });
      return {
        note: schema.note,
        totalObjects: schema.objects.length,
        objects: schema.objects.slice(0, SCHEMA_OBJECT_LIMIT).map((item) => ({
          name: item.name,
          kind: item.kind,
          columns: item.columns.map((column) => `${column.name} ${column.typeName}${column.primaryKey ? " pk" : ""}${column.nullable ? "" : " not null"}`),
        })),
      };
    },
  },
  {
    def: {
      name: "get_active_query",
      description: "Get the text, connection and last error of the open query tab.",
      parameters: object({}),
    },
    needsApproval: false,
    run: async (_args, ctx) => {
      const tab = requireTab(ctx);
      const profile = ctx.profiles.find((entry) => entry.id === tab.profileId);
      return { title: tab.title, connection: profile?.name, engine: profile?.engine, input: tab.input, error: tab.error };
    },
  },
  {
    def: {
      name: "get_last_result",
      description: `Get columns and the first ${SAMPLE_ROWS} rows of the open tab's last result.`,
      parameters: object({}),
    },
    needsApproval: false,
    run: async (_args, ctx) => {
      const tab = requireTab(ctx);
      return tab.result ? trimResult(tab.result) : "The open tab has no result yet.";
    },
  },
  {
    def: {
      name: "search_history",
      description: "Search past queries of a connection by text. Empty search returns the latest.",
      parameters: object({ ...connectionParam, search: { type: "string" } }),
    },
    needsApproval: false,
    run: async (args, ctx) => {
      const profile = requireProfile(ctx, args);
      const needle = text(args, "search");
      const entries = await api<HistoryEntry[]>("history_list", { id: profile.id });
      return searchHistory(entries, needle)
        .slice(0, HISTORY_LIMIT)
        .map((entry) => ({ input: entry.input, ok: entry.ok, at: new Date(entry.at).toISOString() }));
    },
  },
  {
    def: {
      name: "draft_query",
      description: "Replace the text of the open query tab with a new query. Does not run it.",
      parameters: object({ query: { type: "string" } }, ["query"]),
    },
    needsApproval: true,
    preview: (args, ctx) => [{ field: "Editor", before: ctx.activeTab?.input, after: text(args, "query") }],
    run: async (args, ctx) => {
      ctx.patchTab(requireTab(ctx).id, { input: text(args, "query") });
      return "Editor updated.";
    },
  },
  {
    def: {
      name: "open_tab",
      description: "Open a new query tab on a connection, optionally with starting text.",
      parameters: object({ ...connectionParam, query: { type: "string" } }),
    },
    needsApproval: true,
    preview: (args, ctx) => [
      { field: "Connection", after: profileOf(ctx, args)?.name ?? "(unknown)" },
      { field: "Query", after: text(args, "query") },
    ],
    run: async (args, ctx) => {
      const profile = requireProfile(ctx, args);
      ctx.newTab(profile.id, { input: text(args, "query"), operation: null });
      return `Opened a tab on ${profile.name}.`;
    },
  },
  {
    def: {
      name: "run_query",
      description: `Run a query on a connection and return the first ${SAMPLE_ROWS} rows. The user must approve each run.`,
      parameters: object({ ...connectionParam, query: { type: "string" } }, ["query"]),
    },
    needsApproval: true,
    preview: (args, ctx) => {
      const query = text(args, "query");
      const profile = profileOf(ctx, args);
      const production = profile?.options.production === "true";
      return [
        { field: "Connection", after: `${profile?.name ?? "(unknown)"}${production ? " (production)" : ""}` },
        { field: DESTRUCTIVE.test(query) ? "Query (changes data or schema)" : "Query", after: query },
      ];
    },
    run: async (args, ctx) => {
      const profile = requireConnected(ctx, args);
      const tab = ctx.activeTab?.profileId === profile.id ? ctx.activeTab : undefined;
      if (!tab) throw new Error(`Open a query tab on ${profile.name} first.`);
      const outcome = await ctx.run(tab, text(args, "query"));
      if (outcome.error) throw new Error(outcome.error);
      return outcome.result ? trimResult(outcome.result) : "No result.";
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((tool) => tool.def.name === name);
