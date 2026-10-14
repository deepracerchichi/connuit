import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleX, FlaskConical, LoaderCircle, Plus, RotateCw, X } from "lucide-react";
import { API_URL, apiFetch } from "../../api/client";
import type { Credential, Run, Workflow } from "../../api/types";
import { cn } from "../../lib/cn";
import { errorMessage, useApi } from "../useApi";
import { actionClass, describeCron, ErrorState, LoadingBlock, runDuration, useRise } from "../ui";
import { detectBlock } from "./blocks";
import { emptyDraft, fromWorkflow, toPayload, validate, type Draft, type EditorStep, type Problems } from "./model";
import Pipeline from "./Pipeline";
import { FriendlySettings, StepSettings, TriggerSettings } from "./Settings";
import { TEMPLATES, type Template } from "./templates";
import { MAX_ATTEMPTS, useTestRun, type TestPhase } from "./useTestRun";

export default function WorkflowEditorPage() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft | null>(isNew ? emptyDraft() : null);
  const [savedCopy, setSavedCopy] = useState<string>(""); // the draft as last saved, to spot unsaved changes
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState("trigger");
  const [insertAt, setInsertAt] = useState<number | null>(isNew ? 0 : null);
  const [problems, setProblems] = useState<Problems | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [choosingTemplate, setChoosingTemplate] = useState(isNew); // new workflows start at the gallery
  const [advanced, setAdvanced] = useState<Set<string>>(new Set()); // steps shown with the full form

  const credentials = useApi<Credential[]>("/credentials");
  const test = useTestRun();
  const ref = useRise<HTMLDivElement>(draft !== null);

  // Load the workflow being edited (a brand new one starts empty).
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    apiFetch<Workflow>(`/workflows/${id}`)
      .then((loaded) => {
        if (cancelled) return;
        const loadedDraft = fromWorkflow(loaded);
        setWorkflow(loaded);
        setDraft(loadedDraft);
        setSavedCopy(JSON.stringify(loadedDraft));
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const dirty = draft !== null && JSON.stringify(draft) !== savedCopy;

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loadError) {
    return (
      <div className="pt-8">
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (!draft) return <LoadingBlock rows={4} />;

  if (choosingTemplate) {
    return (
      <TemplateGallery
        onPick={(template) => {
          const picked = template ? template.build() : emptyDraft();
          setDraft(picked);
          setChoosingTemplate(false);
          setInsertAt(template ? null : 0); // from scratch: open the step picker straight away
          // Templates usually need one thing from you (a Slack channel): open that step.
          const needsSetup = picked.steps.find((s) => s.url === "{{credential}}" && !s.credentialId);
          setSelected(needsSetup?.id ?? "trigger");
        }}
      />
    );
  }

  /* ---------- Editing ---------- */

  const edit = (change: (d: Draft) => Draft) => setDraft((d) => (d ? change(d) : d));
  const editStep = (stepId: string, patch: Partial<EditorStep>) => {
    edit((d) => ({ ...d, steps: d.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) }));
    // Editing a step clears its error message; the next save checks it again.
    setProblems((p) => {
      if (!p?.steps[stepId]) return p;
      const steps = { ...p.steps };
      delete steps[stepId];
      const stillBroken = Object.keys(steps).length > 0;
      const general = p.general === "Some steps need attention." && !stillBroken ? null : p.general;
      return general || stillBroken ? { general, steps } : null;
    });
  };

  function insertStep(index: number, step: EditorStep) {
    edit((d) => ({ ...d, steps: [...d.steps.slice(0, index), step, ...d.steps.slice(index)] }));
    setSelected(step.id);
    setInsertAt(null);
  }

  function moveStep(index: number, direction: -1 | 1) {
    edit((d) => {
      const steps = [...d.steps];
      [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
      return { ...d, steps };
    });
  }

  function removeStep(index: number) {
    if (draft!.steps[index]?.id === selected) setSelected("trigger");
    edit((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  }

  /* ---------- Saving, testing, deleting ---------- */

  async function save(): Promise<Workflow | null> {
    if (!draft) return null;
    const found = validate(draft);
    setProblems(found);
    if (found) {
      const firstBadStep = draft.steps.find((s) => found.steps[s.id]);
      if (firstBadStep) setSelected(firstBadStep.id);
      return null;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const body = JSON.stringify(toPayload(draft));
      const result = isNew
        ? await apiFetch<Workflow>("/workflows", { method: "POST", body })
        : await apiFetch<Workflow>(`/workflows/${id}`, { method: "PUT", body });
      setWorkflow(result);
      setSavedCopy(JSON.stringify(draft));
      // Same page, now with a real id (the route is /workflows/:id, so nothing remounts).
      if (isNew) navigate(`/dashboard/workflows/${result._id}`, { replace: true });
      return result;
    } catch (err) {
      setSaveError(errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  // A test always runs what's on screen, so save first if anything changed.
  async function runTest() {
    const saved = dirty || isNew ? await save() : workflow;
    if (saved) test.start(saved._id);
  }

  async function deleteWorkflow() {
    try {
      await apiFetch<void>(`/workflows/${id}`, { method: "DELETE" });
      navigate("/dashboard/workflows");
    } catch (err) {
      setSaveError(errorMessage(err));
      setConfirmDelete(false);
    }
  }

  const testing = test.phase === "queued" || test.phase === "running" || test.phase === "retrying";
  const webhookUrl = workflow?.webhookToken && draft.trigger.type === "webhook" ? `${API_URL}/webhooks/${workflow.webhookToken}` : null;
  const selectedIndex = draft.steps.findIndex((s) => s.id === selected);

  const renderSettings = (key: string) => {
    if (key === "trigger") {
      return <TriggerSettings trigger={draft.trigger} onChange={(trigger) => edit((d) => ({ ...d, trigger }))} webhookUrl={webhookUrl} />;
    }
    const index = draft.steps.findIndex((s) => s.id === key);
    if (index < 0) return null;
    const step = draft.steps[index];
    const { block, params } = detectBlock(step);
    const friendly = block.key !== "custom";
    const setAdvancedFor = (on: boolean) =>
      setAdvanced((current) => {
        const next = new Set(current);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });

    // Friendly blocks get a few plain questions; "Advanced settings" shows the full request.
    if (friendly && !advanced.has(key)) {
      return (
        <FriendlySettings
          key={key}
          step={step}
          index={index}
          block={block}
          params={params}
          onChange={(patch) => editStep(key, patch)}
          credentials={credentials.data ?? []}
          onAdvanced={() => setAdvancedFor(true)}
        />
      );
    }
    return (
      <StepSettings
        key={key}
        step={step}
        index={index}
        onChange={(patch) => editStep(key, patch)}
        credentials={credentials.data ?? []}
        onSimple={friendly ? () => setAdvancedFor(false) : undefined}
      />
    );
  };

  return (
    <div ref={ref}>
      <Link to="/dashboard/workflows" className="js-rise inline-flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Workflows
      </Link>

      {/* ---------- Header: name + actions ---------- */}
      <header className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <span className="js-rise inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
            <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
            {isNew ? "New workflow" : "Workflow editor"}
          </span>
          <input
            value={draft.name}
            onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
            aria-label="Workflow name"
            placeholder="Name your workflow"
            className="js-rise mt-5 w-full rounded-lg bg-transparent text-4xl tracking-tight outline-none placeholder:text-ink/25 hover:bg-ink/3 focus:bg-white md:text-6xl"
          />
          <p className="js-rise mt-2 text-sm text-ink/50">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
          </p>
        </div>

        <div className="js-rise flex flex-wrap items-center gap-2">
          {!isNew &&
            (confirmDelete ? (
              <span className="flex h-11 items-center gap-2 rounded-xl bg-red-50 pl-4 pr-1.5 text-sm text-red-700">
                Delete it and its runs?
                <button type="button" onClick={() => setConfirmDelete(false)} className={actionClass("ghost", "h-8 px-3 text-red-700 hover:bg-red-100 hover:text-red-800")}>
                  Keep
                </button>
                <button type="button" onClick={deleteWorkflow} className={actionClass("danger", "h-8 bg-red-600 px-3 text-white hover:bg-red-700 hover:text-white")}>
                  Delete
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={actionClass("danger")}>
                Delete
              </button>
            ))}
          <button type="button" onClick={runTest} disabled={testing || saving} className={actionClass("secondary")}>
            <FlaskConical className="h-4 w-4" strokeWidth={1.75} />
            {dirty || isNew ? "Save & test" : "Test run"}
          </button>
          <button type="button" onClick={save} disabled={saving || (!dirty && !isNew)} className={actionClass("primary", "px-6")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {isNew && (
        <ol className="js-rise mt-6 grid gap-2 text-sm sm:grid-cols-3">
          {[
            "Click the green card to choose when it runs.",
            "Click any step to change it, or + to add one.",
            "Save, then Test run to watch it go.",
          ].map((tip, i) => (
            <li key={tip} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-ink/10">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs">{i + 1}</span>
              <span className="text-ink/70">{tip}</span>
            </li>
          ))}
        </ol>
      )}

      {(problems?.general || saveError) && (
        <p role="alert" className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
          {saveError ?? problems?.general}
        </p>
      )}

      <TestBanner
        phase={test.phase}
        run={test.run}
        attempt={test.attempt}
        error={test.error}
        workflowId={test.workflowId}
        onClose={test.reset}
      />

      {/* ---------- Pipeline + settings ---------- */}
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="mx-auto w-full max-w-xl">
          <Pipeline
            draft={draft}
            selected={selected}
            onSelect={(key) => setSelected(key)}
            insertAt={insertAt}
            onOpenInsert={setInsertAt}
            onInsert={insertStep}
            onMove={moveStep}
            onRemove={removeStep}
            problems={problems}
            run={test.phase === "idle" ? null : test.run}
            renderSettings={renderSettings}
          />
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6">{renderSettings(selectedIndex >= 0 ? selected : "trigger")}</div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- What the test run is doing right now ---------- */

function TestBanner({
  phase,
  run,
  attempt,
  error,
  workflowId,
  onClose,
}: {
  phase: TestPhase;
  run: Run | null;
  attempt: number;
  error: string | null;
  workflowId: string | null;
  onClose: () => void;
}) {
  if (phase === "idle") return null;

  const failedStep = run?.steps.find((s) => s.status === "failed");
  const runLink = run && workflowId && (
    <Link to={`/dashboard/runs/${workflowId}/${run._id}`} className="inline-flex items-center gap-1 underline underline-offset-4">
      See the full run <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
    </Link>
  );

  const content: Record<TestPhase, { icon: ReactNode; text: ReactNode; tone: string }> = {
    idle: { icon: null, text: null, tone: "" },
    queued: {
      icon: <LoaderCircle className="h-4 w-4 animate-spin text-accent" strokeWidth={2} />,
      text: "Queued. Waiting for a worker to pick it up…",
      tone: "bg-ink text-white",
    },
    running: {
      icon: <LoaderCircle className="h-4 w-4 animate-spin text-accent" strokeWidth={2} />,
      text: `Running · attempt ${attempt} of ${MAX_ATTEMPTS}`,
      tone: "bg-ink text-white",
    },
    retrying: {
      icon: <RotateCw className="h-4 w-4 animate-spin text-accent [animation-duration:2s]" strokeWidth={2} />,
      text: (
        <>
          A step failed{failedStep?.error ? `: ${failedStep.error}` : ""}. Retrying automatically · attempt {attempt + 1} of {MAX_ATTEMPTS} coming up
        </>
      ),
      tone: "bg-ink text-white",
    },
    succeeded: {
      icon: <CircleCheck className="h-4 w-4" strokeWidth={2} />,
      text: (
        <>
          Succeeded{run && runDuration(run) ? ` in ${runDuration(run)}` : ""}
          {attempt > 1 ? ` on attempt ${attempt}` : ""}. {runLink}
        </>
      ),
      tone: "bg-accent text-ink",
    },
    failed: {
      icon: <CircleX className="h-4 w-4" strokeWidth={2} />,
      text: (
        <>
          Failed after {attempt} {attempt === 1 ? "attempt" : "attempts"}
          {failedStep?.error ? `: ${failedStep.error}` : ""}. {runLink}
        </>
      ),
      tone: "border border-red-200 bg-red-50 text-red-700",
    },
    error: {
      icon: <CircleAlert className="h-4 w-4" strokeWidth={2} />,
      text: error,
      tone: "border border-red-200 bg-red-50 text-red-700",
    },
  };

  const { icon, text, tone } = content[phase];
  return (
    <div role="status" className={cn("mt-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm", tone)}>
      {icon}
      <span className="min-w-0 flex-1">{text}</span>
      {(phase === "succeeded" || phase === "failed" || phase === "error") && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded-md p-1 opacity-60 hover:opacity-100">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/* ---------- Where a new workflow starts: pick something close, then adjust it ---------- */

function TemplateGallery({ onPick }: { onPick: (template: Template | null) => void }) {
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
              onClick={() => onPick(template)}
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
                {draft.steps.map((step, i) => {
                  const { block } = detectBlock(step);
                  return (
                    <span key={step.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="h-0.5 w-4 rounded-full bg-ink" />}
                      <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs", block.ai ? "bg-accent" : "bg-mint")}>
                        <block.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {block.label}
                      </span>
                    </span>
                  );
                })}
              </div>

              <span className="mt-6 inline-flex items-center gap-2 text-sm text-ink/60 transition-colors group-hover:text-ink">
                Use this template <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPick(null)}
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
