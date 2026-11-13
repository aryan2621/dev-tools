import { type KV, type SavedRequest, newKV } from "./types";

const VARIABLE = /(\{\{[^}]*\}\})/;

const isActive = (item: KV) => item.enabled && item.key !== "";

const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const encode = (text: string) =>
  text
    .split(VARIABLE)
    .map((part, index) => (index % 2 === 1 ? part : encodeURIComponent(part)))
    .join("");

function split(url: string) {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const rest = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = rest.indexOf("?");
  return {
    base: queryAt >= 0 ? rest.slice(0, queryAt) : rest,
    query: queryAt >= 0 ? rest.slice(queryAt + 1) : "",
    hash,
  };
}

function parseQuery(query: string): Array<[string, string]> {
  return query
    .split("&")
    .filter((pair) => pair !== "")
    .map((pair) => {
      const at = pair.indexOf("=");
      return at < 0 ? [decode(pair), ""] : [decode(pair.slice(0, at)), decode(pair.slice(at + 1))];
    });
}

export function paramsFromUrl(url: string, current: KV[]): KV[] {
  const parsed = parseQuery(split(url).query);
  const next: KV[] = [];
  for (const item of current) {
    if (!isActive(item)) next.push(item);
    else if (parsed.length > 0) {
      const [key, value] = parsed.shift()!;
      next.push({ ...item, key, value });
    }
  }
  return [...next, ...parsed.map(([key, value]) => newKV(key, value))];
}

export function urlWithParams(url: string, params: KV[]): string {
  const { base, hash } = split(url);
  const query = params
    .filter(isActive)
    .map((item) => `${encode(item.key)}=${encode(item.value)}`)
    .join("&");
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

export const withUrl = (request: SavedRequest, url: string): SavedRequest => ({
  ...request,
  url,
  params: paramsFromUrl(url, request.params),
});
