import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronDown, ChevronUp, CircleAlert, Clock, Play, Plus, Trash2, Webhook, X } from "lucide-react";
import type { Run, RunStep } from "../../api/types";
import { cn } from "../../lib/cn";
import { describeCron, formatDuration, StatusIcon } from "../ui";
import { BLOCKS, detectBlock } from "./blocks";
import type { Draft, EditorStep, Problems } from "./model";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface PipelineProps {
  draft: Draft;
  selected: string; // "trigger" or a step id
  onSelect: (id: string) => void;
  insertAt: number | null;
  onOpenInsert: (index: number | null) => void;
  onInsert: (index: number, step: EditorStep) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  problems: Problems | null;
  run: Run | null; // the test run being watched, if any
  renderSettings: (id: string) => ReactNode; // shown under the selected card on small screens
}

export default function Pipeline(props: PipelineProps) {
  const { draft, selected, onSelect, insertAt, onOpenInsert, onInsert, onMove, onRemove, problems, run, renderSettings } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  // How many steps the lime pulse has reached. Steps only show their result once
  // the pulse arrives, so you watch the data travel down the pipe.
  const [reached, setReached] = useState(0);
  const target = run?.steps.length ?? 0;
  const watching = run !== null;

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
    if (reduceMotion()) {
      setReached(target);
      return;
    }

    const pulse = rootRef.current?.querySelector<HTMLElement>(`[data-segment="${reached}"] .js-pulse`);
    if (!pulse) {
      setReached((r) => r + 1);
      return;
    }
    const tween = gsap.fromTo(
      pulse,
      { top: "-6px", opacity: 1 },
      {
        top: "calc(100% - 6px)",
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
  }, [watching, target, reached]);

  const steps = draft.steps;

  return (
    <div ref={rootRef} className="flex flex-col items-stretch">
      <TriggerCard draft={draft} selected={selected === "trigger"} onSelect={() => onSelect("trigger")} />
      {selected === "trigger" && <div className="mt-3 lg:hidden">{renderSettings("trigger")}</div>}

      {steps.map((step, i) => {
        const result = run && i < reached ? run.steps.find((s) => s.nodeId === step.id) : undefined;
        return (
          <Fragment key={step.id}>
            <Pipe segment={i} open={insertAt === i} onAdd={() => onOpenInsert(insertAt === i ? null : i)} />
            {insertAt === i && <StepPicker onPick={(s) => onInsert(i, s)} onClose={() => onOpenInsert(null)} />}
            <StepCard
              step={step}
              index={i}
              count={steps.length}
              selected={selected === step.id}
              error={problems?.steps[step.id]}
              result={result}
              waiting={!!run && i >= reached}
              onSelect={() => onSelect(step.id)}
              onMove={(direction) => onMove(i, direction)}
              onRemove={() => onRemove(i)}
            />
            {selected === step.id && <div className="mt-3 lg:hidden">{renderSettings(step.id)}</div>}
          </Fragment>
        );
      })}

      {/* The open end of the pipe: add the next step */}
      <Pipe segment={steps.length} short />
      {insertAt === steps.length ? (
        <StepPicker onPick={(s) => onInsert(steps.length, s)} onClose={() => onOpenInsert(null)} />
      ) : (
        <button
          type="button"
          onClick={() => onOpenInsert(steps.length)}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-dashed border-ink/30 bg-white px-5 py-2.5 text-sm transition-colors hover:border-ink hover:bg-accent"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          {steps.length === 0 ? "Add your first step" : "Add step"}
        </button>
      )}
    </div>
  );
}

/* ---------- The pipe between cards, with its insert button and the travelling pulse ---------- */

function Pipe({ segment, open = false, short = false, onAdd }: { segment: number; open?: boolean; short?: boolean; onAdd?: () => void }) {
  return (
    <div data-segment={segment} className={cn("relative mx-auto w-1.5 rounded-full bg-ink", short ? "h-8" : "h-16")}>
      {/* The pulse: no Tailwind transforms on it, GSAP animates `top` only */}
      <span className="js-pulse absolute -left-[3px] top-0 h-3 w-3 rounded-full bg-accent opacity-0 shadow-[0_0_14px_5px_rgba(190,242,100,0.75)]" />
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

function selectOnKey(e: KeyboardEvent, select: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    select();
  }
}

function TriggerCard({ draft, selected, onSelect }: { draft: Draft; selected: boolean; onSelect: () => void }) {
  const trigger = draft.trigger;
  const { icon: Icon, title } =
    trigger.type === "cron"
      ? { icon: Clock, title: trigger.schedule.trim() ? describeCron(trigger.schedule) : "Choose a schedule" }
      : trigger.type === "webhook"
        ? { icon: Webhook, title: "When another app calls it" }
        : { icon: Play, title: "When you click Run" };

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
  index,
  count,
  selected,
  error,
  result,
  waiting,
  onSelect,
  onMove,
  onRemove,
}: {
  step: EditorStep;
  index: number;
  count: number;
  selected: boolean;
  error?: string;
  result?: RunStep;
  waiting: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isAi = step.kind === "llm_call";
  const { block, params } = detectBlock(step);
  const Icon = block.icon;
  const kindLabel = block.key === "custom" ? (isAi ? "AI" : "HTTP") : block.label;
  const isCustom = block.key === "custom";

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
        waiting && "opacity-55",
      )}
    >
      <div className="flex items-center gap-4">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", block.ai || isAi ? "bg-accent" : "bg-mint")}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase text-ink/45">
            Step {index + 1} · {kindLabel}
          </p>
          <p className="truncate text-lg">{step.name.trim() || "Untitled step"}</p>
          {/* Friendly blocks describe themselves in words; custom steps show the raw request */}
          <p className={cn("truncate text-xs text-ink/50", isCustom && "font-mono")}>{block.summary(params, step)}</p>
        </div>

        {result ? (
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink/55">
            {result.finishedAt && formatDuration(new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime())}
            <StatusIcon status={result.status} className="h-5 w-5" />
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
            <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ChevronUp className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </IconButton>
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
      {result && result.output !== undefined && (
        <PopIn className="mt-3 max-h-24 overflow-hidden rounded-xl bg-ink px-3 py-2 font-mono text-xs leading-relaxed text-white/85">
          {preview(result.output)}
        </PopIn>
      )}
    </div>
  );
}

function preview(output: unknown) {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function IconButton({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
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
function PopIn({ className, children }: { className: string; children: ReactNode }) {
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

function StepPicker({ onPick, onClose }: { onPick: (step: EditorStep) => void; onClose: () => void }) {
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
        <p className="font-mono text-xs uppercase text-ink/55">Add a step</p>
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
