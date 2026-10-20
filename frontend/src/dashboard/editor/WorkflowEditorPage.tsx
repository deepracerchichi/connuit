import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleX, FlaskConical, LoaderCircle, RotateCw, Trash2, X } from "lucide-react";
import { API_URL, apiFetch } from "../../api/client";
import type { Credential, Run, Workflow } from "../../api/types";
import { cn } from "../../lib/cn";
import { errorMessage, useApi } from "../useApi";
import { actionClass, ErrorState, runDuration, useMediaQuery, useRise } from "../ui";
import { detectBlock } from "./blocks";
import {
  allSteps,
  changeList,
  changeStep,
  earlierSteps,
  emptyDraft,
  findStep,
  fromWorkflow,
  addBranch,
  branchTarget,
  listAt,
  locate,
  moveWithBranches,
  tidyBranches,
  paths,
  ROOT,
  runnable,
  toPayload,
  triggerHasData,
  uniqueName,
  validate,
  type Draft,
  type EditorStep,
  type Problems,
  type Slot,
} from "./model";
import Canvas from "./Canvas";
import Pipeline from "./Pipeline";
import { FriendlySettings, StepSettings, TriggerSettings } from "./Settings";
import { TEMPLATES } from "./templates";
import { MAX_ATTEMPTS, useTestRun, type TestPhase } from "./useTestRun";

export default function WorkflowEditorPage() {
  // Existing workflows: /dashboard/workflows/:id. New ones arrive from the gallery as
  // /dashboard/workflows/new/:template (a template key, or "scratch").
  const { id, template: templateKey } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const [start] = useState(() => (isNew ? startingPoint(templateKey) : null)); // worked out once, on arrival

  const [draft, setDraft] = useState<Draft | null>(start?.draft ?? null);
  const [savedCopy, setSavedCopy] = useState<string>(""); // the draft as last saved, to spot unsaved changes
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(start?.selected ?? null); // what the inspector shows; null = closed
  const [insertAt, setInsertAt] = useState<Slot | null>(start?.insertAt ?? null);
  const [problems, setProblems] = useState<Problems | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advanced, setAdvanced] = useState<Set<string>>(new Set()); // steps shown with the full form

  const credentials = useApi<Credential[]>("/credentials");
  const test = useTestRun();
  const ref = useRise<HTMLDivElement>(draft !== null);
  const isDesktop = useMediaQuery("(min-width: 1024px)"); // canvas on desktop, vertical list on phones

  // Load the workflow being edited (a brand new one starts empty).
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    apiFetch<Workflow>(`/workflows/${id}`)
      .then((loaded) => {
        if (cancelled) return;
        const loadedDraft = fromWorkflow(loaded);
        if (!loadedDraft) {
          setLoadError(
            "This workflow has a shape the editor can't draw yet (for example, steps running side by side without an If). It still runs as saved; change it through the API.",
          );
          return;
        }
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

  // Esc closes the inspector (the step picker handles Esc itself while it is open).
  useEffect(() => {
    if (insertAt !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea, select")) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [insertAt]);

  if (isNew && !start) return <Navigate to="/dashboard/workflows/new" replace />; // unknown template

  if (loadError) {
    return (
      <div className="flex h-svh items-center justify-center bg-paper p-6">
        <div className="w-full max-w-lg">
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="flex h-svh items-center justify-center bg-paper" aria-label="Loading">
        <LoaderCircle className="h-6 w-6 animate-spin text-ink/40" strokeWidth={2} />
      </div>
    );
  }

  /* ---------- Editing ---------- */

  const edit = (change: (d: Draft) => Draft) => setDraft((d) => (d ? change(d) : d));
  const editStep = (stepId: string, patch: Partial<EditorStep>) => {
    edit((d) => ({ ...d, steps: changeStep(d.steps, stepId, patch) }));
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

  // Steps live in lists (the main line, or an If's Yes/No path); a slot says which list and where.
  // A "branch" slot means: add this step as a new outlet of that step instead.
  function insertStep(slot: Slot, step: EditorStep) {
    const from = branchTarget(slot);
    edit((d) => {
      const named = { ...step, name: uniqueName(step.name, d.steps) };
      if (from) {
        const at = locate(d.steps, from.stepId);
        return at ? { ...d, steps: changeList(d.steps, at.list, (list) => addBranch(list, at.index, named, from.side)) } : d;
      }
      return { ...d, steps: changeList(d.steps, slot.list, (list) => [...list.slice(0, slot.index), named, ...list.slice(slot.index)]) };
    });
    setSelected(step.id);
    setInsertAt(null);
  }

  // Moves a step along its own list. An If takes its paths with it, and a step its branches.
  function moveStep(stepId: string, direction: -1 | 1) {
    edit((d) => {
      const at = locate(d.steps, stepId);
      return at ? { ...d, steps: changeList(d.steps, at.list, (list) => moveWithBranches(list, stepId, direction)) } : d;
    });
  }

  function removeStep(stepId: string) {
    const step = findStep(draft!.steps, stepId);
    const at = locate(draft!.steps, stepId);
    if (!step || !at) return;
    // A step's branches hang off it, so they go with it; so do an If's paths. Check first.
    const list = listAt(draft!.steps, at.list);
    const branches = list[at.index + 1]?.kind === "split" ? [list[at.index + 1]] : [];
    const going = [step, ...branches];
    const inside = runnable(going.flatMap((item) => paths(item).flatMap((path) => path.list)));
    const what = step.kind === "condition" ? "its paths" : "its branches";
    if (inside.length > 0 && !window.confirm(`Remove “${step.name.trim() || "this step"}” and the ${inside.length} ${inside.length === 1 ? "step" : "steps"} on ${what}?`)) return;
    if (selected && allSteps(going).some((s) => s.id === selected)) setSelected(null);
    const goingIds = new Set(going.map((item) => item.id));
    edit((d) => {
      const without = changeList(d.steps, at.list, (l) => l.filter((s) => !goingIds.has(s.id)));
      return { ...d, steps: tidyBranches(without, at.list) }; // an emptied branch disappears
    });
  }

  /* ---------- Saving, testing, deleting ---------- */

  async function save(): Promise<Workflow | null> {
    if (!draft) return null;
    const found = validate(draft);
    setProblems(found);
    if (found) {
      const firstBadStep = runnable(draft.steps).find((s) => found.steps[s.id]); // a split's problem shows on the canvas itself
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
    if (!saved) return;
    setSelected(null); // close the inspector so the whole pipe is visible while it runs
    test.start(saved._id);
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
  const everyStep = runnable(draft.steps); // splits have no settings, so they never open the inspector
  const selectedStep = everyStep.find((s) => s.id === selected);

  const renderSettings = (key: string) => {
    if (key === "trigger") {
      return (
        <TriggerSettings
          trigger={draft.trigger}
          onChange={(trigger) => edit((d) => ({ ...d, trigger }))}
          webhookUrl={webhookUrl}
          credentials={credentials.data ?? []}
        />
      );
    }
    const index = everyStep.findIndex((s) => s.id === key);
    if (index < 0) return null;
    const step = everyStep[index];
    const number = index + 1;
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
    if (block.simpleOnly || (friendly && !advanced.has(key))) {
      return (
        <FriendlySettings
          key={key}
          step={step}
          number={number}
          block={block}
          params={params}
          onChange={(patch) => editStep(key, patch)}
          credentials={credentials.data ?? []}
          onAdvanced={block.simpleOnly ? undefined : () => setAdvancedFor(true)}
        />
      );
    }
    return (
      <StepSettings
        key={key}
        step={step}
        number={number}
        earlier={earlierSteps(draft.steps, key)}
        withTrigger={triggerHasData(draft.trigger)}
        onChange={(patch) => editStep(key, patch)}
        credentials={credentials.data ?? []}
        onSimple={friendly ? () => setAdvancedFor(false) : undefined}
      />
    );
  };

  const inspectorOpen = selected === "trigger" || selectedStep !== undefined;
  const statusText = saving ? "Saving…" : dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved";
  const hasBanner = Boolean(problems?.general || saveError || test.phase !== "idle");
  const banners = (
    <>
      {(problems?.general || saveError) && (
        <p role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
          {saveError ?? problems?.general}
        </p>
      )}
      <TestBanner phase={test.phase} run={test.run} attempt={test.attempt} error={test.error} workflowId={test.workflowId} onClose={test.reset} />
    </>
  );

  // Shared by the desktop canvas and the phone list.
  const pipeProps = {
    draft,
    insertAt,
    onOpenInsert: setInsertAt,
    onInsert: insertStep,
    onMove: moveStep,
    onRemove: removeStep,
    problems,
    run: test.phase === "idle" ? null : test.run,
  };

  return (
    <div ref={ref} className="flex h-svh flex-col overflow-hidden bg-paper text-ink">
      {/* ---------- Top bar: back, name, actions ---------- */}
      <header className="relative z-40 flex h-16 shrink-0 items-center gap-2 border-b border-ink/10 bg-paper px-2 sm:gap-3 sm:px-4">
        <Link
          to="/dashboard/workflows"
          title="Back to workflows"
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span className="hidden md:inline">Workflows</span>
        </Link>
        <span className="hidden h-6 w-px bg-ink/10 sm:block" />

        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
            aria-label="Workflow name"
            placeholder="Name your workflow"
            className="w-full max-w-md truncate rounded-lg bg-transparent px-2 py-0.5 text-base tracking-tight outline-none placeholder:text-ink/30 hover:bg-ink/5 focus:bg-white sm:text-lg"
          />
          <p className="truncate px-2 text-xs text-ink/45">{statusText}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!isNew &&
            (confirmDelete ? (
              <span className="flex h-11 items-center gap-1.5 rounded-xl bg-red-50 pl-3 pr-1.5 text-sm text-red-700">
                <span className="hidden lg:inline">Delete it and its runs?</span>
                <span className="lg:hidden">Delete?</span>
                <button type="button" onClick={() => setConfirmDelete(false)} className={actionClass("ghost", "h-8 px-2.5 text-red-700 hover:bg-red-100 hover:text-red-800")}>
                  Keep
                </button>
                <button type="button" onClick={deleteWorkflow} className={actionClass("danger", "h-8 bg-red-600 px-2.5 text-white hover:bg-red-700 hover:text-white")}>
                  Delete
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete workflow" className={actionClass("danger", "px-3")}>
                <Trash2 className="h-4 w-4 sm:hidden" strokeWidth={1.75} />
                <span className="hidden sm:inline">Delete</span>
              </button>
            ))}
          <button type="button" onClick={runTest} disabled={testing || saving} className={actionClass("secondary", "px-3")}>
            <FlaskConical className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">{dirty || isNew ? "Save & test" : "Test run"}</span>
          </button>
          <button type="button" onClick={save} disabled={saving || (!dirty && !isNew)} className={actionClass("primary", "px-5")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {isDesktop ? (
        /* ---------- Desktop: the canvas, with the inspector sliding over its right side ---------- */
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Canvas
            {...pipeProps}
            selected={inspectorOpen ? selected : null}
            onSelect={setSelected}
            coveredRight={inspectorOpen ? INSPECTOR_SPACE : 0}
            overlay={hasBanner ? banners : undefined}
          />
          {inspectorOpen && (
            <Inspector key={selected} onClose={() => setSelected(null)}>
              {renderSettings(selected!)}
            </Inspector>
          )}
        </div>
      ) : (
        /* ---------- Phones: the same steps as a vertical list, settings opening under the tapped step ---------- */
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
          {hasBanner && <div className="mb-4 flex flex-col gap-2">{banners}</div>}
          <Pipeline {...pipeProps} selected={selected ?? ""} onSelect={setSelected} renderSettings={renderSettings} />
        </div>
      )}
    </div>
  );
}

/* ---------- The inspector: a step's settings, sliding in over the canvas ---------- */

const INSPECTOR_SPACE = 448; // its 26rem width plus the gaps around it; the canvas keeps nodes out from under it

function Inspector({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    if (!panelRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(panelRef.current, { x: 32, autoAlpha: 0, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity,visibility" });
  }, { scope: panelRef });

  return (
    <aside ref={panelRef} aria-label="Step settings" className="absolute bottom-4 right-4 top-4 z-30 flex w-[26rem] flex-col">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        title="Close (Esc)"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
      {/* The settings panels bring their own card styling; inside the drawer, the drawer is the card */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-[0_24px_60px_-24px_rgba(14,66,41,0.4)] ring-1 ring-ink/10 [&>div]:rounded-none [&>div]:border-0">
        {children}
      </div>
    </aside>
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
    <div role="status" className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-sm", tone)}>
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

/* ---------- Where a new workflow starts ---------- */

function startingPoint(templateKey: string | undefined) {
  if (templateKey === "scratch") {
    return { draft: emptyDraft(), selected: null, insertAt: { list: ROOT, index: 0 } }; // empty pipe, step picker open
  }
  const template = TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return null;
  const draft = template.build();
  // Templates usually need one thing from you (a Telegram bot, a Slack channel): open that first.
  if (draft.trigger.type === "telegram" && !draft.trigger.credentialId) return { draft, selected: "trigger", insertAt: null };
  const needsSetup = allSteps(draft.steps).find(
    (s) => !s.credentialId && (s.url === "{{credential}}" || s.kind === "telegram_message"),
  );
  return { draft, selected: needsSetup?.id ?? null, insertAt: null };
}
