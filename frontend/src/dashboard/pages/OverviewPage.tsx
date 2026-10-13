import { Link } from "react-router";
import { ArrowRight, History } from "lucide-react";
import { buttonClass } from "../../components/Button";
import { cn } from "../../lib/cn";
import { useActivity } from "../useApi";
import { RunRow } from "../RunRow";
import { EmptyState, ErrorState, isToday, LoadingBlock, PageHeader, useRise } from "../ui";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export default function OverviewPage() {
  const { data, error, loading, reload } = useActivity();
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
          <Link to="/dashboard/workflows" className={buttonClass("primary", "inline-flex items-center gap-2")}>
            Your workflows <ArrowRight className="h-4 w-4" strokeWidth={2} />
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
                    action={<Link to="/dashboard/workflows" className={buttonClass("primary")}>Go to workflows</Link>}
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
