import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Maximize, Minus, Plus, Trash2 } from "lucide-react";
import type { Run, RunStep } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatDuration, StatusIcon } from "../ui";
import { detectBlock } from "./blocks";
import type { Draft, EditorStep, Problems } from "./model";
import { IconButton, PopIn, preview, selectOnKey, StepPicker, triggerSummary, usePulse } from "./Pipeline";

// The desktop editor: compact nodes on a horizontal pipe, on a canvas you can pan and zoom.
// Drag the background (or scroll) to move around, Ctrl/Cmd + scroll to zoom, "Fit" to see it all.

const MIN_SCALE = 0.35;
const READABLE_SCALE = 0.85; // smallest size the editor opens at, so node text stays legible
const MAX_SCALE = 1.4;
const EDGE = 56; // keep nodes at least this far from the visible edges when bringing them into view

const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

interface View {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasProps {
  draft: Draft;
  selected: string | null; // "trigger", a step id, or nothing
  onSelect: (id: string | null) => void;
  insertAt: number | null;
  onOpenInsert: (index: number | null) => void;
  onInsert: (index: number, step: EditorStep) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  problems: Problems | null;
  run: Run | null;
  coveredRight: number; // pixels hidden behind the inspector panel on the right
  overlay?: ReactNode; // banners floating over the top of the canvas
}

export default function Canvas(props: CanvasProps) {
  const { draft, selected, onSelect, insertAt, onOpenInsert, onInsert, onMove, onRemove, problems, run, coveredRight, overlay } = props;

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [smooth, setSmooth] = useState(false); // ease programmatic moves; follow the pointer exactly while dragging
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);

  const reached = usePulse(worldRef, run, "x");
  const steps = draft.steps;

  /* ---------- Camera ---------- */

  const visibleWidth = useCallback(() => (viewportRef.current?.clientWidth ?? 0) - coveredRight, [coveredRight]);

  // Scale and centre so the whole workflow fits the visible area.
  // `readable`: never shrink below READABLE_SCALE; if it still doesn't fit, start at the
  // trigger instead (used when the editor opens, so long workflows stay legible).
  const fit = useCallback(
    (readable = false) => {
      const viewport = viewportRef.current;
      const world = worldRef.current;
      if (!viewport || !world) return;
      const width = visibleWidth();
      const height = viewport.clientHeight;
      const fitScale = clamp(Math.min((width - EDGE) / world.offsetWidth, (height - EDGE) / world.offsetHeight, 1));
      const scale = readable ? Math.max(fitScale, READABLE_SCALE) : fitScale;
      const fits = world.offsetWidth * scale <= width - EDGE;
      setSmooth(true);
      setView({
        scale,
        x: fits ? (width - world.offsetWidth * scale) / 2 : EDGE / 2,
        y: (height - world.offsetHeight * scale) / 2,
      });
    },
    [visibleWidth],
  );

  // Glide just enough to show a node comfortably (does nothing if it's already in view).
  const bringIntoView = useCallback(
    (id: string) => {
      const node = worldRef.current?.querySelector<HTMLElement>(`[data-node="${id}"]`);
      if (!node || !viewportRef.current) return;
      const v = viewRef.current;
      const width = visibleWidth();
      const left = v.x + node.offsetLeft * v.scale;
      const right = left + node.offsetWidth * v.scale;
      if (left >= EDGE && right <= width - EDGE) return;
      setSmooth(true);
      setView({ ...v, x: width / 2 - (node.offsetLeft + node.offsetWidth / 2) * v.scale });
    },
    [visibleWidth],
  );

  // Zoom by a factor, keeping the point under (px, py) where it is.
  const zoomAt = useCallback((factor: number, px: number, py: number, animate: boolean) => {
    setSmooth(animate);
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const zoomFromCentre = (factor: number) => zoomAt(factor, visibleWidth() / 2, (viewportRef.current?.clientHeight ?? 0) / 2, true);

  // Fit once on arrival, before the first paint, so it never flashes at the wrong size.
  useLayoutEffect(() => {
    fit(true);
    setSmooth(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring the selected node into view (e.g. after adding a step, or when the inspector covers it).
  useEffect(() => {
    if (selected) bringIntoView(selected);
  }, [selected, steps.length, bringIntoView]);

  // During a test run the camera follows the pulse, so you can watch every step happen.
  useEffect(() => {
    if (!run || steps.length === 0) return;
    bringIntoView(steps[Math.min(reached, steps.length - 1)].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run !== null, reached, bringIntoView]);

  // Wheel: scroll pans (vertical scroll moves sideways, since the pipe runs left to right);
  // Ctrl/Cmd + scroll (and trackpad pinch, which browsers report the same way) zooms.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-scrollable]")) return; // let the step picker scroll
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = viewport.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top, false);
        return;
      }
      setSmooth(false);
      setView((v) => (e.deltaX ? { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } : { ...v, x: v.x - e.deltaY }));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false }); // passive:false so preventDefault stops page zoom/scroll
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------- Drag the background to pan; a plain click on it closes the inspector ---------- */

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-node], button, [data-nopan]")) return;
    drag.current = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSmooth(false);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return; // tiny jitters still count as a click
    d.moved = true;
    setDragging(true);
    setView((v) => ({ ...v, x: d.viewX + dx, y: d.viewY + dy }));
  }

  function onPointerUp() {
    if (drag.current && !drag.current.moved) onSelect(null);
    drag.current = null;
    setDragging(false);
  }

  /* ---------- Render ---------- */

  const dot = 24 * view.scale;

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn("absolute inset-0 touch-none select-none overflow-hidden", dragging ? "cursor-grabbing" : "cursor-grab")}
      style={{
        // The dotted grid moves and scales with the canvas, so panning feels physical.
        backgroundImage: "radial-gradient(circle, rgba(14,66,41,0.16) 1.2px, transparent 1.3px)",
        backgroundSize: `${dot}px ${dot}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        ref={worldRef}
        className="absolute left-0 top-0 flex items-center px-10 py-28"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
          // Only programmatic moves glide; GSAP never animates this element, so a CSS transition is safe here.
          transition: smooth ? "transform 450ms cubic-bezier(0.25, 1, 0.5, 1)" : "none",
        }}
      >
        <TriggerNode draft={draft} selected={selected === "trigger"} onSelect={() => onSelect("trigger")} />

        {steps.map((step, i) => {
          const result = run && i < reached ? run.steps.find((s) => s.nodeId === step.id) : undefined;
          return (
            <Fragment key={step.id}>
              <Pipe segment={i} open={insertAt === i} onAdd={() => onOpenInsert(insertAt === i ? null : i)} />
              <StepNode
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
            </Fragment>
          );
        })}

        <Pipe segment={steps.length} short />
        <button
          type="button"
          onClick={() => onOpenInsert(insertAt === steps.length ? null : steps.length)}
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 rounded-full border border-dashed px-5 text-sm transition-colors",
            insertAt === steps.length ? "border-ink bg-accent" : "border-ink/30 bg-white hover:border-ink hover:bg-accent",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          {steps.length === 0 ? "Add your first step" : "Add step"}
        </button>
      </div>

      {/* ---------- Floating UI (not scaled with the canvas, so it's always readable) ---------- */}

      {overlay && (
        <div
          data-nopan
          className="absolute top-4 z-20 flex w-[min(44rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2"
          style={{ left: `calc((100% - ${coveredRight}px) / 2)` }}
        >
          {overlay}
        </div>
      )}

      {insertAt !== null && (
        <div
          data-nopan
          data-scrollable
          className="absolute bottom-6 z-20 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2"
          style={{ left: `calc((100% - ${coveredRight}px) / 2)` }}
        >
          <StepPicker onPick={(step) => onInsert(insertAt, step)} onClose={() => onOpenInsert(null)} />
        </div>
      )}

      <div data-nopan className="absolute bottom-6 left-6 z-20 flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-ink/10">
        <ZoomButton label="Zoom out" onClick={() => zoomFromCentre(1 / 1.2)}>
          <Minus className="h-4 w-4" strokeWidth={2} />
        </ZoomButton>
        <span className="w-12 text-center font-mono text-xs text-ink/55">{Math.round(view.scale * 100)}%</span>
        <ZoomButton label="Zoom in" onClick={() => zoomFromCentre(1.2)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
        </ZoomButton>
        <span className="mx-1 h-5 w-px bg-ink/10" />
        <button
          type="button"
          onClick={() => fit()}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-mono text-xs uppercase text-ink/70 transition-colors hover:bg-mint hover:text-ink"
        >
          <Maximize className="h-3.5 w-3.5" strokeWidth={2} /> Fit
        </button>
      </div>

      {insertAt === null && (
        <p
          data-nopan
          className="pointer-events-none absolute bottom-7 -translate-x-1/2 whitespace-nowrap text-xs text-ink/40"
          style={{ left: `calc((100% - ${coveredRight}px) / 2)` }}
        >
          Drag to move around · Ctrl + scroll to zoom · Click a step to edit it
        </p>
      )}
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/70 transition-colors hover:bg-mint hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ---------- The horizontal pipe between nodes ---------- */

function Pipe({ segment, open = false, short = false, onAdd }: { segment: number; open?: boolean; short?: boolean; onAdd?: () => void }) {
  return (
    <div data-segment={segment} className={cn("relative h-1.5 shrink-0 rounded-full bg-ink", short ? "w-10" : "w-24")}>
      {/* The pulse: GSAP animates `left` only, so no Tailwind transforms on it */}
      <span className="js-pulse absolute -top-0.75 left-0 h-3 w-3 rounded-full bg-accent opacity-0 shadow-[0_0_14px_5px_rgba(190,242,100,0.75)]" />
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

/* ---------- Nodes ---------- */

function TriggerNode({ draft, selected, onSelect }: { draft: Draft; selected: boolean; onSelect: () => void }) {
  const { icon: Icon, title } = triggerSummary(draft.trigger);
  return (
    <div
      data-node="trigger"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => selectOnKey(e, onSelect)}
      className={cn(
        "js-rise flex w-60 shrink-0 cursor-pointer items-center gap-3 rounded-2xl bg-accent p-3.5 outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-ink/30",
        selected && "ring-2 ring-ink",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-accent">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase text-ink/60">Trigger</p>
        <p className="truncate text-sm">{title}</p>
      </div>
    </div>
  );
}

function StepNode({
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

  return (
    <div
      data-node={step.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => selectOnKey(e, onSelect)}
      className={cn(
        "js-rise group relative w-60 shrink-0 cursor-pointer rounded-2xl border bg-white p-3.5 outline-none transition-[border-color,box-shadow] focus-visible:ring-4 focus-visible:ring-ink/20",
        selected ? "border-ink ring-2 ring-ink" : "border-ink/10 hover:border-ink/30",
        error && !selected && "border-red-300",
        waiting && "opacity-55",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", block.ai || isAi ? "bg-accent" : "bg-mint")}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] uppercase text-ink/45">
            {index + 1} · {kindLabel}
          </p>
          <p className="truncate text-sm">{step.name.trim() || "Untitled step"}</p>
        </div>
      </div>
      <p className={cn("mt-2.5 truncate text-xs text-ink/50", block.key === "custom" && "font-mono")}>{block.summary(params, step)}</p>

      {/* Test-run status badge */}
      {result && (
        <span className="absolute -right-2.5 -top-2.5 flex items-center gap-1.5 rounded-full bg-white py-1 pl-2 pr-1 font-mono text-[10px] text-ink/55 shadow-sm ring-1 ring-ink/10">
          {result.finishedAt && formatDuration(new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime())}
          <StatusIcon status={result.status} className="h-4 w-4" />
        </span>
      )}

      {/* Move / remove: above the node on hover (the padding bridges the gap so hover isn't lost) */}
      {!result && (
        <div className={cn("absolute bottom-full right-0 pb-2", selected ? "block" : "hidden group-hover:block group-focus-within:block")}>
          <div className="flex gap-0.5 rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-ink/10">
            <IconButton label="Move left" disabled={index === 0} onClick={() => onMove(-1)}>
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label="Move right" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label="Remove step" danger onClick={onRemove}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      )}

      {/* Below the node: what's wrong, or what the step produced */}
      <div className="absolute left-0 top-full w-full pt-2.5">
        {error && (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-red-700">
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} /> {error}
          </p>
        )}
        {result?.error && <PopIn className="rounded-xl bg-red-50 px-3 py-2 font-mono text-[11px] leading-snug text-red-700">{result.error}</PopIn>}
        {result && result.output !== undefined && (
          <PopIn className="max-h-20 overflow-hidden rounded-xl bg-ink px-3 py-2 font-mono text-[11px] leading-relaxed text-white/85">
            {preview(result.output)}
          </PopIn>
        )}
      </div>
    </div>
  );
}
