import { Fragment } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { cn } from "../../lib/cn";
import { describeCron, useRise } from "../ui";
import { detectBlock } from "../editor/blocks";
import { TEMPLATES } from "../editor/templates";
import type { EditorStep } from "../editor/model";

// "New workflow" lands here, inside the normal dashboard. Picking a template (or starting
// from scratch) opens the full-screen canvas at /dashboard/workflows/new/<template>.
export default function NewWorkflowPage() {
  const navigate = useNavigate();
  return <TemplateGallery onPick={(key) => navigate(`/dashboard/workflows/new/${key}`)} />;
}

/* ---------- Where a new workflow starts: pick something close, then adjust it ---------- */

function TemplateGallery({ onPick }: { onPick: (templateKey: string) => void }) {
  const ref = useRise<HTMLDivElement>(true);

  return (
    <div ref={ref}>
      <div>
        <Link to="/dashboard/workflows" className="js-rise inline-flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Workflows
        </Link>
      </div>
      <span className="js-rise mt-6 inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
        <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
        New workflow
      </span>
      <h1 className="js-rise mt-6 text-5xl tracking-tight md:text-6xl">Start with a template.</h1>
      <p className="js-rise mt-3 max-w-xl text-lg text-ink/60">Pick the one closest to what you want. You can change every part of it.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((template) => {
          const draft = template.build();
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => onPick(template.key)}
              className="js-rise group flex flex-col rounded-2xl border border-ink/10 bg-white p-6 text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_20px_40px_-24px_rgba(14,66,41,0.45)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent">
                  <template.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/60">
                  {draft.trigger.type === "cron" ? describeCron(draft.trigger.schedule) : draft.trigger.type === "webhook" ? "When another app calls it" : "When you click Run"}
                </span>
              </div>
              <h2 className="mt-5 text-2xl tracking-tight">{template.title}</h2>
              <p className="mt-2 leading-relaxed text-ink/60">{template.description}</p>

              {/* Its steps, as a mini pipe */}
              <div className="mt-6 flex flex-wrap items-center gap-1.5">
                <MiniPipe steps={draft.steps} />
              </div>

              <span className="mt-6 inline-flex items-center gap-2 text-sm text-ink/60 transition-colors group-hover:text-ink">
                Use this template <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPick("scratch")}
          className="js-rise flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink/25 p-6 text-center transition-colors hover:border-ink hover:bg-white md:col-span-2"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink/5">
            <Plus className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="text-lg">Start from scratch</span>
          <span className="text-sm text-ink/55">An empty pipe: add your own steps one by one.</span>
        </button>
      </div>
    </div>
  );
}

// A template's steps as a row of chips. An If shows its Yes path in a dashed group after it.
function MiniPipe({ steps }: { steps: EditorStep[] }) {
  return steps.map((step, i) => {
    const { block } = detectBlock(step);
    return (
      // A fragment, not a wrapper: each chip wraps on its own, so an If and its path stay on one line when they fit.
      <Fragment key={step.id}>
        {i > 0 && <span className="h-0.5 w-4 rounded-full bg-ink" />}
        <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", block.ai ? "bg-accent" : "bg-mint")}>
          <block.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          {block.label}
        </span>
        {step.yes.length > 0 && (
          <>
            <span className="h-0.5 w-4 rounded-full bg-ink" />
            <span className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-ink/30 p-1.5">
              <span className="px-1 font-mono text-[10px] uppercase text-ink/55">If yes</span>
              <MiniPipe steps={step.yes} />
            </span>
          </>
        )}
      </Fragment>
    );
  });
}
