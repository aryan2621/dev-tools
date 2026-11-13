import type { Collection, Environment, Folder, KV, SavedRequest } from "./types";

export interface Located {
  request: SavedRequest;
  collection: Collection;
  folder: Folder | null;
}

export function locateAll(collections: Collection[]): Located[] {
  return collections.flatMap((collection) => [
    ...collection.requests.map((request) => ({ request, collection, folder: null })),
    ...collection.folders.flatMap((folder) =>
      folder.requests.map((request) => ({ request, collection, folder })),
    ),
  ]);
}

export const locate = (collections: Collection[], requestId: string | null) =>
  locateAll(collections).find((entry) => entry.request.id === requestId) ?? null;

const mapList = (list: SavedRequest[], id: string, change: (request: SavedRequest) => SavedRequest) =>
  list.map((request) => (request.id === id ? change(request) : request));

export const mapRequest = (
  collections: Collection[],
  id: string,
  change: (request: SavedRequest) => SavedRequest,
): Collection[] =>
  collections.map((collection) => ({
    ...collection,
    requests: mapList(collection.requests, id, change),
    folders: collection.folders.map((folder) => ({ ...folder, requests: mapList(folder.requests, id, change) })),
  }));

export const removeRequest = (collections: Collection[], id: string): Collection[] =>
  collections.map((collection) => ({
    ...collection,
    requests: collection.requests.filter((request) => request.id !== id),
    folders: collection.folders.map((folder) => ({
      ...folder,
      requests: folder.requests.filter((request) => request.id !== id),
    })),
  }));

export const insertRequest = (
  collections: Collection[],
  request: SavedRequest,
  collectionId: string,
  folderId?: string | null,
): Collection[] =>
  collections.map((collection) => {
    if (collection.id !== collectionId) return collection;
    if (!folderId) return { ...collection, requests: [...collection.requests, request] };
    return {
      ...collection,
      folders: collection.folders.map((folder) =>
        folder.id === folderId ? { ...folder, requests: [...folder.requests, request] } : folder,
      ),
    };
  });

export function moveRequest(
  collections: Collection[],
  id: string,
  collectionId: string,
  folderId: string | null,
): Collection[] {
  const entry = locate(collections, id);
  if (!entry) return collections;
  return insertRequest(removeRequest(collections, id), entry.request, collectionId, folderId);
}

export const enabledPairs = (items: KV[]) => items.filter((item) => item.enabled && item.key !== "");

export function variablesFor(
  collection: Collection | null | undefined,
  environment: Environment | undefined,
): KV[] {
  return [...(collection?.variables ?? []), ...(environment?.variables ?? [])];
}

export const collectionRequests = (collection: Collection): SavedRequest[] => [
  ...collection.folders.flatMap((folder) => folder.requests),
  ...collection.requests,
];
