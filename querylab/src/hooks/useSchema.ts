import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { SchemaInfo } from "../types";

export function useSchema(profileId: string | null, connected: boolean) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    if (!profileId || !connected) {
      setSchema(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await api<SchemaInfo>("schema", { id: profileId });
      if (request === latest.current) setSchema(loaded);
    } catch (failure) {
      if (request === latest.current) setError(String(failure));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [profileId, connected]);

  useEffect(() => {
    load();
  }, [load]);

  return { schema, error, loading, reload: load };
}

export type SchemaState = ReturnType<typeof useSchema>;
