import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { SchemaInfo } from "../types";

export function useSchema(profileId: string | null, connected: boolean) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profileId || !connected) {
      setSchema(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSchema(await api<SchemaInfo>("schema", { id: profileId }));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setLoading(false);
    }
  }, [profileId, connected]);

  useEffect(() => {
    load();
  }, [load]);

  return { schema, error, loading, reload: load };
}

export type SchemaState = ReturnType<typeof useSchema>;
