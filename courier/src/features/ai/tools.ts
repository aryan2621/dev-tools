import { commands } from "@/commands";
import { enabledPairs, locateAll } from "@/tree";
import {
  type ApiResponse,
  type KV,
  METHODS,
  type SavedRequest,
  type ToolDef,
  newKV,
  newRequest,
} from "@/types";
import type { Courier } from "@/store";

const SECRET_NAME =
  /authorization|token|secret|key|cookie|password|passwd|credential/i;
const MASK = "••••••";
const BODY_LIMIT = 4000;

type Args = Record<string, unknown>;

export interface ToolSpec {
  def: ToolDef;
  needsApproval: boolean;
  preview?: (args: Args, courier: Courier) => PreviewRow[];
  run: (args: Args, courier: Courier) => Promise<unknown> | unknown;
}

export interface PreviewRow {
  field: string;
  before: string;
  after: string;
}

const maskKV = (item: KV) => ({
  key: item.key,
  value: SECRET_NAME.test(item.key) && item.value ? MASK : item.value,
  enabled: item.enabled,
});

const maskedRequest = (request: SavedRequest) => ({
  id: request.id,
  name: request.name,
  method: request.method,
  url: request.url,
  params: request.params.map(maskKV),
  headers: request.headers.map(maskKV),
  body: {
    type: request.body.type,
    raw: request.body.raw,
    form: request.body.formItems.map(maskKV),
  },
  auth: {
    type: request.auth.type,
    configured:
      request.auth.token !== "" ||
      request.auth.password !== "" ||
      request.auth.keyValue !== "",
  },
});

const truncate = (text: string) =>
  text.length > BODY_LIMIT
    ? `${text.slice(0, BODY_LIMIT)}\n…truncated ${text.length - BODY_LIMIT} chars`
    : text;

export const maskedResponse = (response: ApiResponse) => ({
  status: response.status,
  statusText: response.statusText,
  durationMs: response.durationMs,
  size: response.size,
  url: response.resolvedUrl,
  error: response.error,
  headers: response.headers.map((header) => ({
    name: header.name,
    value: SECRET_NAME.test(header.name) ? MASK : header.value,
  })),
  body: response.binary
    ? "(binary)"
    : truncate(response.prettyBody ?? response.body),
});

const pairs = (value: unknown): KV[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is Args => typeof item === "object" && item !== null,
        )
        .map((item) => newKV(String(item.key ?? ""), String(item.value ?? "")))
    : [];

export function applyChanges(request: SavedRequest, args: Args): SavedRequest {
  const next = { ...request };
  if (typeof args.name === "string") next.name = args.name;
  if (
    typeof args.method === "string" &&
    METHODS.includes(args.method.toUpperCase() as never)
  ) {
    next.method = args.method.toUpperCase() as SavedRequest["method"];
  }
  if (typeof args.url === "string") next.url = args.url;
  if (args.headers !== undefined) next.headers = pairs(args.headers);
  if (args.params !== undefined) next.params = pairs(args.params);
  if (typeof args.body === "object" && args.body !== null) {
    const body = args.body as Args;
    next.body = {
      ...request.body,
      type: (typeof body.type === "string"
        ? body.type
        : request.body.type) as SavedRequest["body"]["type"],
      raw: typeof body.raw === "string" ? body.raw : request.body.raw,
      formItems:
        body.form !== undefined ? pairs(body.form) : request.body.formItems,
    };
  }
  if (typeof args.auth === "object" && args.auth !== null) {
    const auth = args.auth as Args;
    next.auth = {
      ...request.auth,
      type: (typeof auth.type === "string"
        ? auth.type
        : request.auth.type) as SavedRequest["auth"]["type"],
      token: typeof auth.token === "string" ? auth.token : request.auth.token,
      username:
        typeof auth.username === "string"
          ? auth.username
          : request.auth.username,
      password:
        typeof auth.password === "string"
          ? auth.password
          : request.auth.password,
    };
  }
  return next;
}

const describe = (request: SavedRequest) => ({
  name: request.name,
  method: request.method,
  url: request.url,
  headers: enabledPairs(request.headers)
    .map((item) => `${item.key}: ${maskKV(item).value}`)
    .join("\n"),
  params: enabledPairs(request.params)
    .map((item) => `${item.key}=${maskKV(item).value}`)
    .join("\n"),
  body: request.body.raw,
  auth: request.auth.type,
});

const diff = (before: SavedRequest, after: SavedRequest): PreviewRow[] => {
  const a = describe(before);
  const b = describe(after);
  return (Object.keys(a) as (keyof typeof a)[])
    .filter((field) => a[field] !== b[field])
    .map((field) => ({ field, before: a[field], after: b[field] }));
};

const targetOf = (args: Args, courier: Courier) =>
  locateAll(courier.collections).find(
    (entry) => entry.request.id === (args.id ?? courier.selected?.id),
  )?.request ?? null;

const KEY_VALUE = {
  type: "object",
  properties: { key: { type: "string" }, value: { type: "string" } },
  required: ["key", "value"],
};

const REQUEST_FIELDS = {
  name: { type: "string" },
  method: { type: "string", enum: [...METHODS] },
  url: {
    type: "string",
    description: "Full URL; {{variable}} placeholders allowed",
  },
  headers: {
    type: "array",
    description: "Replaces all headers",
    items: KEY_VALUE,
  },
  params: {
    type: "array",
    description: "Replaces all query params",
    items: KEY_VALUE,
  },
  body: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [
          "none",
          "json",
          "text",
          "formUrlEncoded",
          "multipart",
          "graphql",
        ],
      },
      raw: { type: "string" },
      form: {
        type: "array",
        items: KEY_VALUE,
      },
    },
  },
  auth: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["none", "bearer", "basic", "apiKey"] },
      token: { type: "string" },
      username: { type: "string" },
      password: { type: "string" },
    },
  },
};

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required });

export const TOOLS: ToolSpec[] = [
  {
    def: {
      name: "get_active_request",
      description: "Get the request open in the editor. Secrets are masked.",
      parameters: object({}),
    },
    needsApproval: false,
    run: (_, courier) =>
      courier.selected
        ? maskedRequest(courier.selected)
        : "No request is open.",
  },
  {
    def: {
      name: "get_last_response",
      description:
        "Get the last response of the open request (body truncated, secrets masked).",
      parameters: object({}),
    },
    needsApproval: false,
    run: (_, courier) => {
      const response = courier.selected
        ? courier.responses[courier.selected.id]
        : undefined;
      return response
        ? maskedResponse(response)
        : "The open request has not been sent yet.";
    },
  },
  {
    def: {
      name: "list_requests",
      description: "List every saved request with its collection.",
      parameters: object({}),
    },
    needsApproval: false,
    run: (_, courier) =>
      locateAll(courier.collections).map(({ request, collection, folder }) => ({
        id: request.id,
        name: request.name,
        method: request.method,
        url: request.url,
        collection: collection.name,
        collectionId: collection.id,
        folder: folder?.name ?? null,
      })),
  },
  {
    def: {
      name: "list_environments",
      description:
        "List environments and their variable names (values of secret-looking variables are masked).",
      parameters: object({}),
    },
    needsApproval: false,
    run: (_, courier) =>
      courier.environments.map((environment) => ({
        name: environment.name,
        active: environment.id === courier.activeEnvironment?.id,
        variables: environment.variables.map(maskKV),
      })),
  },
  {
    def: {
      name: "search_history",
      description: "Search sent-request history by URL or method.",
      parameters: object({ query: { type: "string" } }, ["query"]),
    },
    needsApproval: false,
    run: async (args) => {
      const query = String(args.query ?? "").toLowerCase();
      const entries = await commands.listHistory();
      return entries
        .filter((entry) =>
          `${entry.request.method} ${entry.request.url}`
            .toLowerCase()
            .includes(query),
        )
        .slice(0, 20)
        .map((entry) => ({
          method: entry.request.method,
          url: entry.request.url,
          status: entry.status,
          durationMs: entry.durationMs,
          date: entry.date,
        }));
    },
  },
  {
    def: {
      name: "update_request",
      description:
        "Edit a request. Pass only the fields to change; headers and params replace the whole list. Defaults to the open request.",
      parameters: object({ id: { type: "string" }, ...REQUEST_FIELDS }),
    },
    needsApproval: true,
    preview: (args, courier) => {
      const request = targetOf(args, courier);
      return request ? diff(request, applyChanges(request, args)) : [];
    },
    run: (args, courier) => {
      const request = targetOf(args, courier);
      if (!request) return "Request not found.";
      courier.updateRequest(request.id, (current) =>
        applyChanges(current, args),
      );
      return "Updated.";
    },
  },
  {
    def: {
      name: "create_request",
      description:
        "Create a new request in a collection (defaults to the first collection).",
      parameters: object({
        collectionId: { type: "string" },
        ...REQUEST_FIELDS,
      }),
    },
    needsApproval: true,
    preview: (args) => diff(newRequest(), applyChanges(newRequest(), args)),
    run: (args, courier) => {
      const collection =
        courier.collections.find((entry) => entry.id === args.collectionId) ??
        courier.collections[0];
      if (!collection) return "There is no collection to add the request to.";
      const request = applyChanges(newRequest(), args);
      courier.addRequest(collection.id, undefined, request);
      return { created: request.id, collection: collection.name };
    },
  },
  {
    def: {
      name: "set_variable",
      description:
        "Set a variable in the active environment, creating it if missing.",
      parameters: object(
        { key: { type: "string" }, value: { type: "string" } },
        ["key", "value"],
      ),
    },
    needsApproval: true,
    preview: (args, courier) => {
      const key = String(args.key);
      const before = courier.activeEnvironment?.variables.find(
        (variable) => variable.key === key,
      );
      return [
        {
          field: key,
          before: before ? maskKV(before).value : "",
          after: maskKV(newKV(key, String(args.value))).value,
        },
      ];
    },
    run: (args, courier) => {
      const active = courier.activeEnvironment;
      if (!active) return "No active environment. Ask the user to select one.";
      const key = String(args.key);
      const value = String(args.value);
      const exists = active.variables.some((variable) => variable.key === key);
      const variables = exists
        ? active.variables.map((variable) =>
            variable.key === key ? { ...variable, value } : variable,
          )
        : [...active.variables, newKV(key, value)];
      courier.setEnvironments(
        courier.environments.map((environment) =>
          environment.id === active.id
            ? { ...environment, variables }
            : environment,
        ),
      );
      return "Set.";
    },
  },
  {
    def: {
      name: "send_request",
      description:
        "Send a request and return the response. Defaults to the open request.",
      parameters: object({ id: { type: "string" } }),
    },
    needsApproval: true,
    preview: (args, courier) => {
      const request = targetOf(args, courier);
      return request
        ? [
            {
              field: "send",
              before: "",
              after: `${request.method} ${request.url}`,
            },
          ]
        : [];
    },
    run: async (args, courier) => {
      const request = targetOf(args, courier);
      if (!request) return "Request not found.";
      const response = await courier.send(request.id);
      return response ? maskedResponse(response) : "Cancelled.";
    },
  },
];

export const toolByName = (name: string) =>
  TOOLS.find((tool) => tool.def.name === name);
