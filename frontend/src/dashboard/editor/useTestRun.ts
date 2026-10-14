import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "../../api/client";
import type { Run } from "../../api/types";
import { errorMessage } from "../useApi";

// Must match the backend queue's defaultJobOptions (attempts: 3, backoff 2s then 4s).
export const MAX_ATTEMPTS = 3;
const GAVE_UP_AFTER_MS = 6500; // longer than the biggest backoff: no retry is coming

export type TestPhase = "idle" | "queued" | "running" | "retrying" | "succeeded" | "failed" | "error";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Queues a real run, then follows it until it's truly finished, retries included.
export function useTestRun() {
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [run, setRun] = useState<Run | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const mounted = useRef(true);
  const currentTest = useRef(0); // starting a new test (or resetting) makes older loops stop

  useEffect(() => {
    mounted.current = true; // set here too: StrictMode mounts, unmounts, mounts again
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async (id: string) => {
    const testNumber = ++currentTest.current;
    const stillCurrent = () => mounted.current && currentTest.current === testNumber;

    setWorkflowId(id);
    setRun(null);
    setAttempt(1);
    setError(null);
    setPhase("queued");

    try {
      const { runId } = await apiFetch<{ runId: string }>(`/workflows/${id}/runs`, { method: "POST" });
      let attemptNumber = 1;
      let lastStepCount = 0;
      let failedAt: number | null = null;
      const startedAt = Date.now();

      while (stillCurrent() && Date.now() - startedAt < 180_000) {
        await sleep(700);

        let latest: Run;
        try {
          latest = await apiFetch<Run>(`/workflows/${id}/runs/${runId}`);
        } catch (err) {
          // The worker creates the run when it picks the job up; until then it's just queued.
          if (err instanceof ApiError && err.status === 404) continue;
          throw err;
        }
        if (!stillCurrent()) return;

        // A retry starts the run over under the same id: its steps reset and it's running again.
        if (latest.steps.length < lastStepCount || (failedAt !== null && latest.status === "running")) {
          attemptNumber += 1;
          setAttempt(attemptNumber);
          failedAt = null;
        }
        lastStepCount = latest.steps.length;
        setRun(latest);

        if (latest.status === "succeeded") {
          setPhase("succeeded");
          return;
        }

        if (latest.status === "failed") {
          failedAt ??= Date.now();
          if (attemptNumber >= MAX_ATTEMPTS || Date.now() - failedAt > GAVE_UP_AFTER_MS) {
            setPhase("failed");
            return;
          }
          setPhase("retrying");
        } else {
          setPhase("running");
        }
      }

      if (stillCurrent()) {
        setPhase("error");
        setError("Still going. Check Runs for the result.");
      }
    } catch (err) {
      if (stillCurrent()) {
        setPhase("error");
        setError(errorMessage(err));
      }
    }
  }, []);

  const reset = useCallback(() => {
    currentTest.current++;
    setPhase("idle");
    setRun(null);
  }, []);

  return { phase, run, attempt, error, workflowId, start, reset };
}
