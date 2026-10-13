import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api/client";
import type { Run, RunWithWorkflow, Workflow } from "../api/types";

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  // fetch() itself throws (no status at all) when nothing answers on the other end.
  return "Couldn't reach the server. Is the backend running?";
}

// Loads one endpoint. `reload()` refetches without clearing what's on screen,
// so lists don't flash empty after an action.
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true; // a newer request (or unmount) wins; ignore this one's result
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

// Workflows plus every run of every workflow, newest first.
// The backend only lists runs per workflow, so this asks once per workflow, in parallel.
// When the backend gets a GET /runs route, this becomes a single request.
export function useActivity() {
  const [data, setData] = useState<{ workflows: Workflow[]; runs: RunWithWorkflow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const workflows = await apiFetch<Workflow[]>("/workflows");
        const perWorkflow = await Promise.all(
          workflows.map((workflow) =>
            apiFetch<Run[]>(`/workflows/${workflow._id}/runs`).then((runs) =>
              runs.map((run) => ({ ...run, workflowName: workflow.name })),
            ),
          ),
        );
        const runs = perWorkflow.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (!cancelled) {
          setData({ workflows, runs });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading: data === null && error === null, reload };
}
