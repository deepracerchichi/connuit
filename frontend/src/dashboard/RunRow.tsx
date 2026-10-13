import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import type { RunWithWorkflow } from "../api/types";
import { runDuration, StatusBadge, timeAgo } from "./ui";

export function RunRow({ run }: { run: RunWithWorkflow }) {
  return (
    <Link
      to={`/dashboard/runs/${run.workflowId}/${run._id}`}
      className="js-rise group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-mint/40 md:grid-cols-[8.5rem_1fr_6rem_5rem_1.25rem]"
    >
      <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:justify-self-start">
        <StatusBadge status={run.status} />
      </span>
      <span className="col-start-1 row-start-1 min-w-0 md:col-start-auto">
        <span className="block truncate">{run.workflowName}</span>
        <span className="block font-mono text-xs text-ink/45">
          {run._id.slice(0, 8)} · {run.steps.length} {run.steps.length === 1 ? "step" : "steps"}
        </span>
      </span>
      <span className="font-mono text-sm text-ink/60">{runDuration(run) ?? "—"}</span>
      <span className="text-right text-sm text-ink/50 md:text-left">{timeAgo(run.createdAt)}</span>
      <ChevronRight className="hidden h-4 w-4 text-ink/30 transition-transform group-hover:translate-x-0.5 md:block" strokeWidth={2} />
    </Link>
  );
}
