import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Copy, Globe, Play, Sparkles, Workflow as WorkflowIcon } from "lucide-react";
import { API_URL, apiFetch, ApiError } from "../../api/client";
import type { Run, RunStatus, RunWithWorkflow, Workflow } from "../../api/types";
import { buttonClass } from "../../components/Button";
import { cn } from "../../lib/cn";
import { errorMessage, useActivity } from "../useApi";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge, StatusIcon, timeAgo, TriggerBadge, useRise } from "../ui";

export default function WorkflowsPage() {
  const { data, error, loading, reload } = useActivity();
  const ref = useRise<HTMLDivElement>(!loading);

  return (
    <div ref={ref}>
      <PageHeader tag="Workflows" title="Workflows." subtitle="Everything you've automated, and how it last went." />

      <div className="mt-10">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingBlock rows={3} />
        ) : data.workflows.length === 0 ? (
          <EmptyState
            icon={<WorkflowIcon className="h-5 w-5" strokeWidth={1.75} />}
            title="No workflows yet"
            body="Workflows you create through the API appear here. The visual editor is coming next."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.workflows.map((workflow) => (
              <WorkflowCard
                key={workflow._id}
                workflow={workflow}
                lastRun={data.runs.find((run) => run.workflowId === workflow._id)}
                onRunFinished={reload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({ workflow, lastRun, onRunFinished }: { workflow: Workflow; lastRun?: RunWithWorkflow; onRunFinished: () => void }) {
  return (
    <article className="js-rise flex min-w-0 flex-col rounded-2xl border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TriggerBadge trigger={workflow.trigger} />
        {lastRun ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink/55">
            <StatusIcon status={lastRun.status} className="h-3.5 w-3.5" />
            Last run {timeAgo(lastRun.createdAt)}
          </span>
        ) : (
          <span className="text-sm text-ink/45">Never run</span>
        )}
      </div>

      <h2 className="mt-5 text-2xl tracking-tight md:text-3xl">{workflow.name}</h2>

      {/* The steps, in order */}
      <ol className="mt-5 flex flex-wrap items-center gap-2">
        {workflow.nodes.map((node, i) => (
          <li key={node.id} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-ink/30" strokeWidth={2} />}
            <span className="inline-flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              {node.config.type === "llm_call" ? (
                <span className="flex h-5 w-5 items-center justify-center rounded bg-accent">
                  <Sparkles className="h-3 w-3" strokeWidth={2} />
                </span>
              ) : (
                <Globe className="h-3.5 w-3.5 text-ink/50" strokeWidth={1.75} />
              )}
              {node.name}
            </span>
          </li>
        ))}
      </ol>

      {workflow.trigger.type === "webhook" && workflow.webhookToken && (
        <WebhookUrl url={`${API_URL}/webhooks/${workflow.webhookToken}`} />
      )}

      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-6">
        <Link to="/dashboard/runs" state={{ workflowId: workflow._id }} className={buttonClass("secondary", "text-sm")}>
          View runs
        </Link>
        <RunNowButton workflowId={workflow._id} onFinished={onRunFinished} />
      </div>
    </article>
  );
}

function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-white">
      <span className="shrink-0 font-mono text-xs text-white/45">POST</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy webhook URL"
        className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check className="h-4 w-4 text-accent" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}

/* ---------- Run now: queue a run, then follow it until it finishes ---------- */

type Phase = { kind: "idle" } | { kind: "live"; status: RunStatus; runId: string } | { kind: "done"; run: Run } | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function RunNowButton({ workflowId, onFinished }: { workflowId: string; onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const alive = useRef(true);
  // Set true inside the effect too: React (StrictMode, in development) mounts, cleans up
  // and mounts again, and the cleanup would otherwise leave this stuck at false.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function start() {
    try {
      const { runId } = await apiFetch<{ runId: string }>(`/workflows/${workflowId}/runs`, { method: "POST" });
      setPhase({ kind: "live", status: "pending", runId });

      // The worker creates the run document when it picks the job up, so until then
      // the run doesn't exist yet (404): that just means "still queued".
      const startedAt = Date.now();
      while (alive.current && Date.now() - startedAt < 120_000) {
        await sleep(1000);
        try {
          const run = await apiFetch<Run>(`/workflows/${workflowId}/runs/${runId}`);
          if (!alive.current) return;
          if (run.status === "succeeded" || run.status === "failed") {
            setPhase({ kind: "done", run });
            onFinished();
            return;
          }
          setPhase({ kind: "live", status: run.status, runId });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }
      }
      if (alive.current) setPhase({ kind: "error", message: "Still running. Check Runs for the result." });
    } catch (err) {
      if (alive.current) setPhase({ kind: "error", message: errorMessage(err) });
    }
  }

  if (phase.kind === "live") {
    return <StatusBadge status={phase.status} />;
  }

  if (phase.kind === "done") {
    return (
      <Link to={`/dashboard/runs/${workflowId}/${phase.run._id}`} className="inline-flex items-center gap-2" title="See every step">
        <StatusBadge status={phase.run.status} />
        <span className="text-sm text-ink/60 underline decoration-ink/20 underline-offset-4">Details</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {phase.kind === "error" && <span className="text-sm text-red-700">{phase.message}</span>}
      <button type="button" onClick={start} className={cn(buttonClass("primary", "inline-flex items-center gap-2 text-sm"))}>
        <Play className="h-3.5 w-3.5" strokeWidth={2} /> Run now
      </button>
    </div>
  );
}
