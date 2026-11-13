import { useEffect, useState } from "react";
import { commands } from "../commands";
import type { KV, SavedRequest } from "../types";

const DEBOUNCE_MS = 200;

interface RequestChecks {
  unresolved: string[];
  blocker: string | null;
}

const CLEAR: RequestChecks = { unresolved: [], blocker: null };

export function useRequestChecks(request: SavedRequest | null, variables: KV[]) {
  const [checks, setChecks] = useState<RequestChecks>(CLEAR);
  useEffect(() => {
    if (!request) return setChecks(CLEAR);
    const timer = window.setTimeout(
      () =>
        Promise.all([commands.unresolvedVariables(request, variables), commands.sendBlocker(request)]).then(
          ([unresolved, blocker]) => setChecks({ unresolved, blocker }),
        ),
      DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [request, variables]);
  return checks;
}
