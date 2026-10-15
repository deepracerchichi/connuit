import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronDown, ChevronUp, CircleAlert, Clock, GitBranchPlus, Play, Plus, Trash2, Webhook, X } from "lucide-react";
import type { Branch, Run, RunStep } from "../../api/types";
import { cn } from "../../lib/cn";
import { describeCron, formatDuration, StatusIcon } from "../ui";
import { BLOCKS, detectBlock } from "./blocks";
import { branchSlot, canBranch, MAX_OUTLETS, movable, outletCount, pathKey, ROOT, sameSlot, type Draft, type EditorStep, type Problems, type Slot } from "./model";
import { BRANCH_LABEL, deliveredResults, kindLabel, resultText, stepNumbers } from "./view";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// What the desktop canvas and the phone list both need.
export interface PipeProps {
  draft: Draft;
  insertAt: Slot | null; // where the step picker is open
  onOpenInsert: (slot: Slot | null) => void;
  onInsert: (slot: Slot, step: EditorStep) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  problems: Problems | null;
  run: Run | null; // the test run being watched, if any
}

export interface PipelineProps extends PipeProps {
  selected: string; // "trigger" or a step id
  onSelect: (id: string) => void;
  renderSettings: (id: string) => ReactNode; // shown under the selected card on small screens
}

// How many of the run's steps the lime pulse has delivered. A step only shows its result once
// the pulse arrives, so you watch the data travel along the pipe. The pulse runs down the pipe
// leading into each step (marked data-into); skipped steps (an If's other path) get none.
// `axis` is the pipe's direction: "y" for the phone list, "x" for the desktop canvas.
export function usePulse(rootRef: RefObject<HTMLElement | null>, run: Run | null, axis: "x" | "y") {
  const [reached, setReached] = useState(0);
  const target = run?.steps.length ?? 0;
  const watching = run !== null;
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // Depends on the step count, not the run object: every poll returns a new object,
  // and re-running this effect each time would cut a pulse off mid-flight.
  useEffect(() => {
    if (!watching) {
      setReached(0);
      return;
    }
    if (target < reached) {
      setReached(0); // a retry started the run over
      return;
    }
    if (reached >= target) return;

    const next = runRef.current?.steps[reached];
    const pulse = next && rootRef.current?.querySelector<HTMLElement>(`[data-into="${CSS.escape(next.nodeId)}"] .js-pulse`);
    if (reduceMotion() || !pulse || next.status === "skipped") {
      setReached((r) => r + 1);
      return;
    }

    const prop = axis === "y" ? "top" : "left";
    const tween = gsap.fromTo(
      pulse,
      { [prop]: "-6px", opacity: 1 },
      {
        [prop]: "calc(100% - 6px)",
        duration: 0.45,
        ease: "power1.in",
        onComplete: () => {
          gsap.to(pulse, { opacity: 0, duration: 0.25 });
          setReached((r) => r + 1);
        },
      },
    );
    return () => {
      tween.kill();
    };
  }, [rootRef, axis, watching, target, reached]);

  return reached;
}

/* ---------- The phone list ---------- */

// Everything a list needs to draw its cards, passed down into If paths unchanged.
interface ListContext extends PipelineProps {
  results: Map<string, RunStep>;
  numbers: Map<string, number>;
}

export default function Pipeline(props: PipelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reached = usePulse(rootRef, props.run, "y");
  const ctx: ListContext = { ...props, results: deliveredResults(props.run, reached), numbers: stepNumbers(props.draft.steps) };
  const { draft, selected, onSelect, renderSettings } = props;

  return (
    <div ref={rootRef} className="flex flex-col items-stretch">
      <TriggerCard draft={draft} selected={selected === "trigger"} onSelect={() => onSelect("trigger")} />
      {selected === "trigger" && <div className="mt-3 lg:hidden">{renderSettings("trigger")}</div>}

      <StepList list={draft.steps} listKey={ROOT} ctx={ctx} />

      {/* The open end of the pipe: add the next step */}
      <Pipe short />
      <AddAtEnd slot={{ list: ROOT, index: draft.steps.length }} ctx={ctx} label={draft.steps.length === 0 ? "Add your first step" : "Add step"} />
    </div>
  );
}

function StepList({ list, listKey, ctx }: { list: EditorStep[]; listKey: string; ctx: ListContext }) {
  const { selected, onSelect, insertAt, onOpenInsert, onInsert, onMove, onRemove, problems, run, renderSettings, results, numbers } = ctx;

  return list.map((step, i) => {
    const slot = { list: listKey, index: i };
    const result = results.get(step.id);
    const picker = sameSlot(insertAt, slot) && <StepPicker onPick={(s) => onInsert(slot, s)} onClose={() => onOpenInsert(null)} />;
    if (step.kind === "split") {
      // A step's branches: no ⊕ before them, since a step put there would take the branches over.
      return (
        <Fragment key={step.id}>
          <Pipe short />
          <SplitPaths split={step} ctx={ctx} />
        </Fragment>
      );
    }
    const branch = branchSlot(step.id);
    const { back, forward } = movable(list, i);
    return (
      <Fragment key={step.id}>
        <Pipe into={step.id} open={sameSlot(insertAt, slot)} onAdd={() => onOpenInsert(sameSlot(insertAt, slot) ? null : slot)} />
        {picker}
        <StepCard
          step={step}
          number={numbers.get(step.id) ?? i + 1}
          first={!back}
          last={!forward}
          selected={selected === step.id}
          error={problems?.steps[step.id]}
          result={result}
          waiting={!!run && !result}
          outlets={canBranch(list, i) ? outletCount(list, i) : null}
          onBranch={() => onOpenInsert(sameSlot(insertAt, branch) ? null : branch)}
          onSelect={() => onSelect(step.id)}
          onMove={(direction) => onMove(step.id, direction)}
          onRemove={() => onRemove(step.id)}
        />
        {sameSlot(insertAt, branch) && <StepPicker title="Add a branch: another step that gets this one's output" onPick={(s) => onInsert(branch, s)} onClose={() => onOpenInsert(null)} />}
        {selected === step.id && <div className="mt-3 lg:hidden">{renderSettings(step.id)}</div>}
        {step.kind === "condition" && <Paths step={step} ctx={ctx} />}
      </Fragment>
    );
  });
}

// An If step's two paths, one under the other, each its own little pipe.
function Paths({ step, ctx }: { step: EditorStep; ctx: ListContext }) {
  const decision = ctx.results.get(step.id)?.decision;
  return (
    <>
      <Pipe short />
      <div className="flex flex-col gap-3">
        {(["yes", "no"] as const).map((branch) => (
          <PathBox
            key={branch}
            list={step[branch]}
            listKey={pathKey(step.id, branch)}
            ctx={ctx}
            tag={<BranchTag branch={branch} taken={decision === branch} />}
            emptyLabel={`Add a step for “${BRANCH_LABEL[branch]}”`}
            className={cn(branch === "yes" ? "border-ink/30 bg-accent/15" : "border-ink/20 bg-white/40", decision && decision !== branch && "opacity-45")}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink/45">Both paths carry on below</p>
    </>
  );
}

// A step's branches: each gets that step's output, and they all run.
function SplitPaths({ split, ctx }: { split: EditorStep; ctx: ListContext }) {
  const error = ctx.problems?.steps[split.id];
  return (
    <>
      <div className="flex flex-col gap-3">
        {split.lanes.map((list, i) => (
          <PathBox
            key={i}
            list={list}
            listKey={pathKey(split.id, i)}
            ctx={ctx}
            tag={<span className="inline-flex rounded-full bg-mint px-2.5 py-1 font-mono text-[10px] uppercase leading-none ring-1 ring-ink/15">Branch {i + 1}</span>}
            emptyLabel={`Add a step to branch ${i + 1}`}
            className="border-ink/25 bg-mint/20"
          />
        ))}
      </div>
      {error && (
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-red-700">
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} /> {error}
        </p>
      )}
      <p className="mt-2 text-center text-xs text-ink/45">Every branch runs. A step added below gets all their results together.</p>
    </>
  );
}

function PathBox({ list, listKey, ctx, tag, emptyLabel, className }: { list: EditorStep[]; listKey: string; ctx: ListContext; tag: ReactNode; emptyLabel: string; className: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed p-3 transition-opacity", className)}>
      {tag}
      <StepList list={list} listKey={listKey} ctx={ctx} />
      {list.length > 0 && <Pipe short />}
      <AddAtEnd slot={{ list: listKey, index: list.length }} ctx={ctx} label={list.length === 0 ? emptyLabel : "Add step"} small />
    </div>
  );
}

export function BranchTag({ branch, taken = false }: { branch: Branch; taken?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase leading-none ring-1",
        branch === "yes" ? "bg-accent ring-ink/15" : "bg-white ring-ink/15",
        taken && "ring-2 ring-ink",
      )}
    >
      If {BRANCH_LABEL[branch].toLowerCase()}
    </span>
  );
}

function AddAtEnd({ slot, ctx, label, small = false }: { slot: Slot; ctx: ListContext; label: string; small?: boolean }) {
  const { insertAt, onOpenInsert, onInsert } = ctx;
  if (sameSlot(insertAt, slot)) return <StepPicker onPick={(s) => onInsert(slot, s)} onClose={() => onOpenInsert(null)} />;
  return (
    <button
      type="button"
      onClick={() => onOpenInsert(slot)}
      className={cn(
        "mx-auto inline-flex items-center gap-2 rounded-full border border-dashed border-ink/30 bg-white transition-colors hover:border-ink hover:bg-accent",
        small ? "mt-2 px-4 py-2 text-xs" : "px-5 py-2.5 text-sm",
      )}
    >
      <Plus className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  );
}

/* ---------- The pipe between cards, with its insert button and the travelling pulse ---------- */

function Pipe({ into, open = false, short = false, onAdd }: { into?: string; open?: boolean; short?: boolean; onAdd?: () => void }) {
  return (
    <div data-into={into} className={cn("pipe-y relative mx-auto w-3 shrink-0", short ? "h-8" : "h-16")}>
      {/* Chevrons pointing the way the data goes */}
      <span className="pipe-flow-y pointer-events-none absolute inset-0" />
      {/* Couplings where the pipe meets what's above and below (short stubs would look like I-beams) */}
      {!short && (
        <>
          <span className="pipe-x pointer-events-none absolute -left-1 top-0 h-1.5 w-5 rounded-xs" />
          <span className="pipe-x pointer-events-none absolute -left-1 bottom-0 h-1.5 w-5 rounded-xs" />
        </>
      )}
      {/* The pulse: no Tailwind transforms on it, GSAP animates `top` only */}
      <span className="js-pulse absolute left-0 top-0 h-3 w-3 rounded-full bg-accent opacity-0 shadow-[0_0_14px_5px_rgba(190,242,100,0.75)]" />
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Insert a step here"
          className={cn(
            "absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-all",
            open ? "rotate-45 border-ink bg-accent" : "border-ink/20 bg-paper hover:scale-110 hover:border-ink hover:bg-accent",
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/* ---------- Cards ---------- */

export function selectOnKey(e: KeyboardEvent, select: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    select();
  }
}

export function triggerSummary(trigger: Draft["trigger"]) {
  return trigger.type === "cron"
    ? { icon: Clock, title: trigger.schedule.trim() ? describeCron(trigger.schedule) : "Choose a schedule" }
    : trigger.type === "webhook"
      ? { icon: Webhook, title: "When another app calls it" }
      : { icon: Play, title: "When you click Run" };
}

function TriggerCard({ draft, selected, onSelect }: { draft: Draft; selected: boolean; onSelect: () => void }) {
  const { icon: Icon, title } = triggerSummary(draft.trigger);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => selectOnKey(e, onSelect)}
      className={cn(
        "js-rise flex cursor-pointer items-center gap-4 rounded-2xl bg-accent p-4 outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-ink/30",
        selected && "ring-2 ring-ink",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-accent">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase text-ink/60">Trigger</p>
        <p className="truncate text-lg">{title}</p>
      </div>
    </div>
  );
}

function StepCard({
  step,
  number,
  first,
  last,
  selected,
  error,
  result,
  waiting,
  outlets,
  onBranch,
  onSelect,
  onMove,
  onRemove,
}: {
  step: EditorStep;
  number: number;
  first: boolean;
  last: boolean;
  selected: boolean;
  error?: string;
  result?: RunStep;
  waiting: boolean;
  outlets: number | null; // how many steps take this one's output, when it can take another
  onBranch: () => void;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { block, params } = detectBlock(step);
  const Icon = block.icon;
  const isCustom = block.key === "custom";
  const skipped = result?.status === "skipped";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => selectOnKey(e, onSelect)}
      className={cn(
        "js-rise group cursor-pointer rounded-2xl border bg-white p-4 outline-none transition-[border-color,box-shadow] focus-visible:ring-4 focus-visible:ring-ink/20",
        selected ? "border-ink ring-2 ring-ink" : "border-ink/10 hover:border-ink/30",
        error && !selected && "border-red-300",
        (waiting || skipped) && "opacity-55",
      )}
    >
      <div className="flex items-center gap-4">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", block.ai || step.kind === "llm_call" ? "bg-accent" : "bg-mint")}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase text-ink/45">
            Step {number} · {kindLabel(step)}
          </p>
          <p className="truncate text-lg">{step.name.trim() || "Untitled step"}</p>
          {/* Friendly blocks describe themselves in words; custom steps show the raw request */}
          <p className={cn("truncate text-xs text-ink/50", isCustom && "font-mono")}>{block.summary(params, step)}</p>
        </div>

        {result ? (
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink/55">
            {skipped ? "skipped" : result.finishedAt && formatDuration(new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime())}
            <StatusIcon status={result.status} className="h-5 w-5" />
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
            <IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>
              <ChevronUp className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            {outlets !== null && (
              <IconButton label={`Add a branch (${outlets} of ${MAX_OUTLETS} used)`} onClick={onBranch}>
                <GitBranchPlus className="h-4 w-4" strokeWidth={1.75} />
              </IconButton>
            )}
            <IconButton label="Remove step" danger onClick={onRemove}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </IconButton>
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-700">
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} /> {error}
        </p>
      )}

      {result?.error && <PopIn className="mt-3 rounded-xl bg-red-50 px-3 py-2 font-mono text-xs text-red-700">{result.error}</PopIn>}
      {result && !skipped && result.output !== undefined && (
        <PopIn className="mt-3 max-h-24 overflow-hidden rounded-xl bg-ink px-3 py-2 font-mono text-xs leading-relaxed text-white/85">
          {resultText(result)}
        </PopIn>
      )}
    </div>
  );
}

export function IconButton({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation(); // don't also select the card
        onClick();
      }}
      className={cn(
        "rounded-md p-1.5 text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-25",
        danger && "hover:bg-red-50 hover:text-red-600",
      )}
    >
      {children}
    </button>
  );
}

// Output and errors spring out of the card when the pulse delivers them.
export function PopIn({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!ref.current || reduceMotion()) return;
    gsap.from(ref.current, { autoAlpha: 0, y: -8, scale: 0.97, duration: 0.45, ease: "back.out(1.7)" });
  }, { scope: ref });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ---------- The ⊕ menu ---------- */

export function StepPicker({ title = "Add a step", onPick, onClose }: { title?: string; onPick: (step: EditorStep) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!ref.current || reduceMotion()) return;
    gsap.from(ref.current, { autoAlpha: 0, y: -10, duration: 0.35, ease: "power3.out" });
    gsap.from(ref.current.querySelectorAll(".js-preset"), { autoAlpha: 0, y: 8, duration: 0.3, stagger: 0.04, delay: 0.05 });
  }, { scope: ref });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={ref} className="my-2 rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_20px_50px_-20px_rgba(14,66,41,0.35)]">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <p className="font-mono text-xs uppercase text-ink/55">{title}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {BLOCKS.map((block) => (
          <button
            key={block.key}
            type="button"
            onClick={() => onPick(block.create())}
            className="js-preset flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-mint/50"
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", block.ai ? "bg-accent" : "bg-mint")}>
              <block.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm">{block.label}</span>
              <span className="block truncate text-xs text-ink/50">{block.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
