import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, GitFork, Globe, Send, Sparkles } from "lucide-react";
import type { Run, RunStep, Workflow, WorkflowNode } from "../../api/types";
import { cn } from "../../lib/cn";
import { useApi } from "../useApi";
import { ErrorState, formatDuration, LoadingBlock, runDuration, StatusBadge, StatusIcon, timeAgo, useRise } from "../ui";

const MAX_OUTPUT_CHARS = 4000;

export default function RunDetailPage() {
  const { workflowId, runId } = useParams();
  const workflow = useApi<Workflow>(`/workflows/${workflowId}`);
  const run = useApi<Run>(`/workflows/${workflowId}/runs/${runId}`);
  const ref = useRise<HTMLDivElement>(!!workflow.data && !!run.data);

  // While the run is still going, refresh it every 1.5s so steps tick over live.
  const active = run.data?.status === "running" || run.data?.status === "pending";
  const reloadRun = run.reload;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(reloadRun, 1500);
    return () => clearInterval(timer);
  }, [active, reloadRun]);

  const error = workflow.error ?? run.error;

  return (
    <div ref={ref}>
      <Link to="/dashboard/runs" className="js-rise inline-flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> All runs
      </Link>

      {error ? (
        <div className="mt-8">
          <ErrorState message={error} onRetry={() => { workflow.reload(); run.reload(); }} />
        </div>
      ) : !workflow.data || !run.data ? (
        <div className="mt-8"><LoadingBlock rows={3} /></div>
      ) : (
        <>
          <header className="mt-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="js-rise inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
                <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
                Run {run.data._id.slice(0, 8)}
              </span>
              <h1 className="js-rise mt-6 text-5xl tracking-tight md:text-6xl">{workflow.data.name}</h1>
              <p className="js-rise mt-3 text-lg text-ink/60">
                Started {timeAgo(run.data.createdAt)}
                {runDuration(run.data) && ` · took ${runDuration(run.data)}`}
              </p>
            </div>
            <div className="js-rise"><StatusBadge status={run.data.status} /></div>
          </header>

          <ol className="relative mt-12">
            {workflow.data.nodes.map((node, i) => (
              <StepItem
                key={node.id}
                index={i}
                node={node}
                step={run.data!.steps.find((s) => s.nodeId === node.id)}
                last={i === workflow.data!.nodes.length - 1}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function StepItem({ index, node, step, last }: { index: number; node: WorkflowNode; step?: RunStep; last: boolean }) {
  const config = node.config;

  return (
    <li className="js-rise relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 pb-6">
      {/* Timeline rail */}
      {!last && <span className="absolute bottom-0 left-5 top-12 w-px bg-ink/15" />}
      <span
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl",
          step ? "bg-white ring-1 ring-ink/10" : "bg-ink/5 text-ink/30",
        )}
      >
        {step ? <StatusIcon status={step.status} className="h-5 w-5" /> : <span className="font-mono text-sm">{index + 1}</span>}
      </span>

      <div className={cn("rounded-2xl border border-ink/10 bg-white p-5", (!step || step.status === "skipped") && "opacity-50")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl tracking-tight">{node.name}</h3>
            <p className="mt-1 flex min-w-0 items-center gap-2 font-mono text-xs text-ink/50">
              {config.type === "llm_call" ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} /> llm_call
                </>
              ) : config.type === "condition" ? (
                <>
                  <GitFork className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">if: {config.question}</span>
                </>
              ) : config.type === "telegram_message" ? (
                <>
                  <Send className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">telegram_message to {config.chatId}</span>
                </>
              ) : (
                <>
                  <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">http_request {config.method} {config.url}</span>
                </>
              )}
            </p>
          </div>
          <span className="font-mono text-xs text-ink/50">
            {!step
              ? "didn't run"
              : step.status === "skipped"
                ? "skipped: on the path not taken"
                : step.finishedAt
                ? `attempt ${step.attempt} · ${formatDuration(new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())}`
                : `attempt ${step.attempt} · running`}
          </span>
        </div>

        {step?.decision && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm">
            <GitFork className="h-4 w-4" strokeWidth={1.75} /> The AI answered <strong className="font-medium">{step.decision}</strong>
          </p>
        )}

        {step?.error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-mono text-sm text-red-700">{step.error}</p>
        )}

        {step?.output !== undefined && (
          <details className="group mt-4">
            <summary className="cursor-pointer select-none text-sm text-ink/60 hover:text-ink">Output</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-white/85">
              {formatOutput(step.output)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}

function formatOutput(output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} more characters)` : text;
}
