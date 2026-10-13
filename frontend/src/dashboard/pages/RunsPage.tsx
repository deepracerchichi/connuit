import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { History, X } from "lucide-react";
import type { RunStatus } from "../../api/types";
import { cn } from "../../lib/cn";
import { useActivity } from "../useApi";
import { RunRow } from "../RunRow";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, useRise } from "../ui";

type Filter = "all" | "succeeded" | "failed" | "active";

const FILTERS: { key: Filter; label: string; matches: (s: RunStatus) => boolean }[] = [
  { key: "all", label: "All", matches: () => true },
  { key: "succeeded", label: "Succeeded", matches: (s) => s === "succeeded" },
  { key: "failed", label: "Failed", matches: (s) => s === "failed" },
  { key: "active", label: "In progress", matches: (s) => s === "running" || s === "pending" },
];

export default function RunsPage() {
  const { data, error, loading, reload } = useActivity();
  const [filter, setFilter] = useState<Filter>("all");
  const ref = useRise<HTMLDivElement>(!loading);
  const navigate = useNavigate();

  // "View runs" on a workflow card opens this page narrowed to that workflow.
  const workflowId = (useLocation().state as { workflowId?: string } | null)?.workflowId;
  const workflowName = data?.workflows.find((w) => w._id === workflowId)?.name;

  const runs = (data?.runs ?? [])
    .filter((run) => !workflowId || run.workflowId === workflowId)
    .filter((run) => FILTERS.find((f) => f.key === filter)!.matches(run.status));

  return (
    <div ref={ref}>
      <PageHeader tag="Runs" title="Runs." subtitle="Every time a workflow ran, step by step." />

      <div className="js-rise mt-10 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-4 py-2 font-mono text-xs uppercase transition-colors",
              filter === f.key ? "bg-ink text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10",
            )}
          >
            {f.label}
          </button>
        ))}
        {workflowName && (
          <button
            type="button"
            onClick={() => navigate(".", { replace: true, state: null })}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm"
          >
            {workflowName} <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <LoadingBlock rows={4} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" strokeWidth={1.75} />}
            title={data?.runs.length ? "Nothing matches" : "No runs yet"}
            body={data?.runs.length ? "Try a different filter." : "Hit Run now on a workflow and it shows up here."}
          />
        ) : (
          <div className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
            {runs.map((run) => (
              <RunRow key={run._id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
