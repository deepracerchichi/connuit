import { Link } from "react-router";
import { ArrowRight, History } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Usage } from "../../api/types";
import { useActivity, useApi } from "../useApi";
import { RunRow } from "../RunRow";
import { ActionChip, actionChipClass, EmptyState, ErrorState, isToday, LoadingBlock, PageHeader, useRise } from "../ui";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export default function OverviewPage() {
  const { data, error, loading, reload } = useActivity();
  const usage = useApi<Usage>("/usage"); // optional extra: if it fails, the card just doesn't show
  const ref = useRise<HTMLDivElement>(!loading);

  const workflows = data?.workflows ?? [];
  const runs = data?.runs ?? [];
  const finished = runs.filter((r) => r.status === "succeeded" || r.status === "failed").slice(0, 50);
  const succeeded = finished.filter((r) => r.status === "succeeded").length;

  const stats = [
    { label: "Workflows", value: String(workflows.length) },
    { label: "Runs today", value: String(runs.filter((r) => isToday(r.createdAt)).length) },
    { label: "Failed today", value: String(runs.filter((r) => r.status === "failed" && isToday(r.createdAt)).length) },
    // Success rate over the last 50 finished runs, so one old failure doesn't haunt it forever.
    { label: "Success rate", value: finished.length ? `${Math.round((succeeded / finished.length) * 100)}%` : "—", highlight: true },
  ];

  return (
    <div ref={ref}>
      <PageHeader
        tag="Overview"
        title={greeting()}
        subtitle="Here's what your workflows have been up to."
        action={
          <Link to="/dashboard/workflows" className={actionChipClass()}>
            Your workflows <ActionChip icon={ArrowRight} />
          </Link>
        }
      />

      <div className="mt-10">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <LoadingBlock rows={2} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={cn(
                    "js-rise rounded-2xl p-5 md:p-6",
                    stat.highlight ? "bg-accent" : "border border-ink/10 bg-white",
                  )}
                >
                  <p className="font-mono text-xs uppercase text-ink/55">{stat.label}</p>
                  <p className="mt-6 text-4xl tracking-tight md:text-5xl">{stat.value}</p>
                </div>
              ))}
            </div>

            {usage.data && <UsageCard usage={usage.data} />}

            <section className="mt-12">
              <div className="js-rise flex items-center justify-between">
                <h2 className="text-2xl tracking-tight">Recent runs</h2>
                {runs.length > 0 && (
                  <Link to="/dashboard/runs" className="text-sm text-ink/60 underline decoration-ink/20 underline-offset-4 hover:text-ink">
                    See all
                  </Link>
                )}
              </div>

              <div className="mt-4">
                {runs.length === 0 ? (
                  <EmptyState
                    icon={<History className="h-5 w-5" strokeWidth={1.75} />}
                    title="No runs yet"
                    body="Run a workflow and every step it takes shows up here."
                    action={
                      <Link to="/dashboard/workflows" className={actionChipClass()}>
                        Go to workflows <ActionChip icon={ArrowRight} />
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-white">
                    {runs.slice(0, 8).map((run) => (
                      <RunRow key={run._id} run={run} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// Today's AI calls against the daily allowance, so running out is never a surprise.
function UsageCard({ usage }: { usage: Usage }) {
  const share = usage.limit > 0 ? Math.min(usage.aiCalls / usage.limit, 1) : 1;
  const used = usage.aiCalls >= usage.limit;
  const low = !used && share >= 0.8;
  // Midnight UTC, shown in the user's own time zone
  const resetTime = new Date(usage.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="js-rise mt-3 rounded-2xl border border-ink/10 bg-white p-5 md:p-6 lg:mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase text-ink/55">AI calls today</p>
          <p className="mt-3 text-4xl tracking-tight md:text-5xl">
            {usage.aiCalls}
            <span className="text-2xl text-ink/35 md:text-3xl"> / {usage.limit}</span>
          </p>
        </div>
        <p className="text-sm text-ink/55">
          Resets at {resetTime} your time
        </p>
      </div>

      <div
        className="mt-5 h-3 overflow-hidden rounded-full bg-ink/5"
        role="progressbar"
        aria-label="AI calls used today"
        aria-valuenow={usage.aiCalls}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
      >
        {/* Only the width animates (CSS); GSAP never touches this bar */}
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", used ? "bg-red-500" : low ? "bg-amber-400" : "bg-accent")}
          style={{ width: `${share * 100}%` }}
        />
      </div>

      <p className={cn("mt-3 text-sm", used ? "text-red-700" : "text-ink/55")}>
        {used
          ? "All used. AI and If steps will fail until the reset; every other step keeps running."
          : low
            ? "Running low. When they're gone, AI and If steps fail until the reset."
            : "Every AI step and every If step uses one call."}
      </p>
    </div>
  );
}
