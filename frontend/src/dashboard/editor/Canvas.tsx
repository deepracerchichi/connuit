import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Maximize, Merge, Minus, Plus, Trash2 } from "lucide-react";
import type { Branch, RunStep } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatDuration, StatusIcon } from "../ui";
import { detectBlock } from "./blocks";
import { allSteps, branchSlot, branchTarget, canBranch, endsInFork, MAX_OUTLETS, movable, outletCount, pathKey, ROOT, sameSlot, type Draft, type EditorStep, type Side, type Slot } from "./model";
import { IconButton, PopIn, selectOnKey, StepPicker, triggerSummary, usePulse, type PipeProps } from "./Pipeline";
import { BRANCH_LABEL, deliveredResults, kindLabel, resultText, stepNumbers } from "./view";

// The desktop editor: compact nodes on a horizontal pipe, on a canvas you can pan and zoom.
// An If node forks the pipe into a Yes lane and a No lane, which join again after it.
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

export interface CanvasProps extends PipeProps {
  selected: string | null; // "trigger", a step id, or nothing
  onSelect: (id: string | null) => void;
  coveredRight: number; // pixels hidden behind the inspector panel on the right
  overlay?: ReactNode; // banners floating over the top of the canvas
}

// Where an element sits inside the (unscaled) world, however deeply it's nested in lanes.
function positionIn(world: HTMLElement, el: HTMLElement) {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = el;
  while (current && current !== world) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

export default function Canvas(props: CanvasProps) {
  const { draft, selected, onSelect, insertAt, onOpenInsert, onInsert, run, coveredRight, overlay } = props;

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
  const stepCount = allSteps(steps).length;
  const ctx: LaneContext = { ...props, results: deliveredResults(run, reached), numbers: stepNumbers(steps) };

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
      const world = worldRef.current;
      const node = world?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
      if (!world || !node || !viewportRef.current) return;
      const v = viewRef.current;
      const box = positionIn(world, node);
      const width = visibleWidth();
      const height = viewportRef.current.clientHeight;
      const left = v.x + box.x * v.scale;
      const top = v.y + box.y * v.scale;
      const fitsX = left >= EDGE && left + box.width * v.scale <= width - EDGE;
      const fitsY = top >= EDGE && top + box.height * v.scale <= height - EDGE;
      if (fitsX && fitsY) return;
      setSmooth(true);
      setView({
        ...v,
        x: fitsX ? v.x : width / 2 - (box.x + box.width / 2) * v.scale,
        y: fitsY ? v.y : height / 2 - (box.y + box.height / 2) * v.scale,
      });
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
  }, [selected, stepCount, bringIntoView]);

  // During a test run the camera follows the pulse, so you can watch every step happen.
  useEffect(() => {
    const ranSteps = run?.steps ?? [];
    if (ranSteps.length === 0) return;
    bringIntoView(ranSteps[Math.min(reached, ranSteps.length - 1)].nodeId);
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
  const endSlot: Slot = { list: ROOT, index: steps.length };

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

        <Sequence list={steps} listKey={ROOT} ctx={ctx} />

        {/* After paths, adding a step would join them: that's the fork's own "Join" button, not "Add step" */}
        {endsInFork(steps) ? null : (
          <>
            <Pipe short />
            <button
              type="button"
              onClick={() => onOpenInsert(sameSlot(insertAt, endSlot) ? null : endSlot)}
              className={cn(
                "flex h-12 shrink-0 items-center gap-2 rounded-full border border-dashed px-5 text-sm transition-colors",
                sameSlot(insertAt, endSlot) ? "border-ink bg-accent" : "border-ink/30 bg-white hover:border-ink hover:bg-accent",
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {steps.length === 0 ? "Add your first step" : "Add step"}
            </button>
          </>
        )}
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
          <StepPicker
            title={branchTarget(insertAt) ? "Add a branch: another step that gets this one's output" : undefined}
            onPick={(step) => onInsert(insertAt, step)}
            onClose={() => onOpenInsert(null)}
          />
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

/* ---------- A list of steps on the pipe; If steps fork into lanes ---------- */

interface LaneContext extends CanvasProps {
  results: Map<string, RunStep>;
  numbers: Map<string, number>;
}

function Sequence({ list, listKey, ctx }: { list: EditorStep[]; listKey: string; ctx: LaneContext }) {
  const { selected, onSelect, insertAt, onOpenInsert, onMove, onRemove, problems, run, results, numbers } = ctx;

  return list.map((step, i) => {
    const slot = { list: listKey, index: i };
    const result = results.get(step.id);
    // Paths only join back up when a step comes after them; otherwise each path just ends.
    const joined = i < list.length - 1;
    const join = joined ? undefined : { list: listKey, index: list.length }; // where "Join paths" would add its step
    if (step.kind === "split") {
      return (
        <Fragment key={step.id}>
          <Pipe short />{/* no ⊕ here: a step put between would take the branches over */}
          <SplitFork split={step} joined={joined} join={join} ctx={ctx} />
        </Fragment>
      );
    }
    return (
      <Fragment key={step.id}>
        <Pipe into={step.id} open={sameSlot(insertAt, slot)} onAdd={() => onOpenInsert(sameSlot(insertAt, slot) ? null : slot)} />
        <StepNode
          step={step}
          number={numbers.get(step.id) ?? i + 1}
          first={!movable(list, i).back}
          last={!movable(list, i).forward}
          selected={selected === step.id}
          error={problems?.steps[step.id]}
          result={result}
          waiting={!!run && !result}
          onSelect={() => onSelect(step.id)}
          onMove={(direction) => onMove(step.id, direction)}
          onRemove={() => onRemove(step.id)}
          outlets={canBranch(list, i) ? outletCount(list, i) : null}
          openSide={(["top", "bottom"] as const).find((side) => sameSlot(insertAt, branchSlot(step.id, side))) ?? null}
          onBranch={(side) => onOpenInsert(sameSlot(insertAt, branchSlot(step.id, side)) ? null : branchSlot(step.id, side))}
        />
        {step.kind === "condition" && (
          <>
            <Pipe short />
            <Fork step={step} joined={joined} join={join} ctx={ctx} />
          </>
        )}
      </Fragment>
    );
  });
}

// An If's two lanes: Yes on top, No below. After a test run, the path not taken fades.
// `joined`: a step comes after the If, so both lanes bend back into one pipe that leads to it.
function Fork({ step, joined, join, ctx }: { step: EditorStep; joined: boolean; join?: Slot; ctx: LaneContext }) {
  const decision = ctx.results.get(step.id)?.decision;
  return (
    <div className={cn("relative flex shrink-0 flex-col", !joined && "items-start")}>
      {(["yes", "no"] as const).map((branch: Branch, i) => (
        <Lane
          key={branch}
          position={i === 0 ? "first" : "last"}
          joined={joined}
          list={step[branch]}
          listKey={pathKey(step.id, branch)}
          ctx={ctx}
          tag={<LaneTag tone={branch === "yes" ? "lime" : "white"} strong={decision === branch}>If {BRANCH_LABEL[branch].toLowerCase()}</LaneTag>}
          emptyLabel={`Add a step for “${BRANCH_LABEL[branch]}”`}
          faded={!!decision && decision !== branch}
        />
      ))}
      <BelowFork join={join} ctx={ctx} />
    </div>
  );
}

// A step's branches: plain pipes out of it, one per lane. Each gets that step's output; a step
// added after them gets all their results together. (Remove a branch's last step and it goes.)
function SplitFork({ split, joined, join, ctx }: { split: EditorStep; joined: boolean; join?: Slot; ctx: LaneContext }) {
  const error = ctx.problems?.steps[split.id];
  return (
    <div className={cn("relative flex shrink-0 flex-col", !joined && "items-start")}>
      {split.lanes.map((list, i) => (
        <Lane
          key={i}
          position={i === 0 ? "first" : i === split.lanes.length - 1 ? "last" : "middle"}
          joined={joined}
          list={list}
          listKey={pathKey(split.id, i)}
          ctx={ctx}
          emptyLabel={`Add a step to branch ${i + 1}`}
        />
      ))}
      <BelowFork join={join} error={error} ctx={ctx} />
    </div>
  );
}

function LaneTag({ tone, strong = false, children }: { tone: "lime" | "white"; strong?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase leading-none ring-1 ring-ink/15",
        tone === "lime" ? "bg-accent" : "bg-white",
        strong && "ring-2 ring-ink",
      )}
    >
      {children}
    </span>
  );
}

// One lane of a fork. Each lane draws its own share of the bends (rounded borders), so the
// left ones meet in one line the incoming pipe hits and the right ones in one line the
// outgoing pipe leaves from, whatever height each lane grows to.
function Lane({
  position,
  joined,
  list,
  listKey,
  ctx,
  tag,
  emptyLabel,
  faded = false,
}: {
  position: "first" | "middle" | "last";
  joined: boolean; // bend back into one pipe on the right (a step follows), or just end
  list: EditorStep[];
  listKey: string;
  ctx: LaneContext;
  tag?: ReactNode; // If lanes are labelled Yes/No; a step's branches are just pipes
  emptyLabel: string;
  faded?: boolean;
}) {
  const { insertAt, onOpenInsert } = ctx;
  const endSlot: Slot = { list: listKey, index: list.length };
  // The bends: a 12px tube drawn with borders (6px = half of it, so it lines up with the middle
  // of the lane's pipe), and a 2px shine down its centre (5px in) to match the straight pipes.
  const tube = cn(
    "pointer-events-none absolute w-8 border-ink",
    position === "first" && "-bottom-px top-[calc(50%-6px)] border-t-12", // -px: overlap the next lane, so no seam shows
    position === "last" && "bottom-[calc(50%-6px)] top-0 border-b-12",
    position === "middle" && "-bottom-px top-0",
  );
  const shine = cn(
    "pointer-events-none absolute w-[calc(2rem-5px)] border-[#2f8058]",
    position === "first" && "-bottom-px top-[calc(50%-1px)] border-t-2",
    position === "last" && "bottom-[calc(50%-1px)] top-0 border-b-2",
    position === "middle" && "-bottom-px top-0",
  );

  return (
    <div className={cn("relative flex items-center py-12 transition-opacity", joined ? "px-8" : "pl-8", faded && "opacity-40")}>
      <span className={cn(tube, "left-0 border-l-12", position === "first" && "rounded-tl-2xl", position === "last" && "rounded-bl-2xl")} />
      <span className={cn(shine, "left-[5px] border-l-2", position === "first" && "rounded-tl-[11px]", position === "last" && "rounded-bl-[11px]")} />
      {joined && (
        <>
          <span className={cn(tube, "right-0 border-r-12", position === "first" && "rounded-tr-2xl", position === "last" && "rounded-br-2xl")} />
          <span className={cn(shine, "right-[5px] border-r-2", position === "first" && "rounded-tr-[11px]", position === "last" && "rounded-br-[11px]")} />
        </>
      )}
      {position === "middle" && (
        <>
          <span className="pipe-x pointer-events-none absolute left-3 top-[calc(50%-6px)] h-3 w-5" />
          {joined && <span className="pipe-x pointer-events-none absolute right-3 top-[calc(50%-6px)] h-3 w-5" />}
        </>
      )}

      {tag}

      <Sequence list={list} listKey={listKey} ctx={ctx} />

      {joined ? (
        // The rest of the lane, stretching so all lanes meet the join together; its ⊕ adds to the end of this path
        <Pipe grow open={sameSlot(insertAt, endSlot)} onAdd={() => onOpenInsert(sameSlot(insertAt, endSlot) ? null : endSlot)} label={list.length === 0 ? emptyLabel : undefined} />
      ) : endsInFork(list) ? null /* this path ends in its own fork, which has its own "Join" button */ : (
        // An open end: this path stops here unless you add to it
        <Pipe
          open={sameSlot(insertAt, endSlot)}
          onAdd={() => onOpenInsert(sameSlot(insertAt, endSlot) ? null : endSlot)}
          label={list.length === 0 ? emptyLabel : "Add a step to this path"}
        />
      )}
    </div>
  );
}

/* ---------- The horizontal pipe between nodes ---------- */

function Pipe({
  into,
  open = false,
  short = false,
  grow = false,
  label,
  onAdd,
}: {
  into?: string; // the step this pipe leads into: the test-run pulse travels along it
  open?: boolean;
  short?: boolean;
  grow?: boolean;
  label?: string;
  onAdd?: () => void;
}) {
  return (
    <div data-into={into} className={cn("pipe-x relative h-3 shrink-0", short ? "w-10" : "w-24", grow && "min-w-24 flex-1")}>
      {/* Chevrons pointing the way the data goes */}
      <span className="pipe-flow-x pointer-events-none absolute inset-0" />
      {/* Couplings where the pipe meets what's on either side */}
      <span className="pipe-y pointer-events-none absolute -top-1 left-0 h-5 w-1.5 rounded-xs" />
      <span className="pipe-y pointer-events-none absolute -top-1 right-0 h-5 w-1.5 rounded-xs" />
      {/* The pulse: GSAP animates `left` only, so no Tailwind transforms on it */}
      <span className="js-pulse absolute top-0 left-0 h-3 w-3 rounded-full bg-accent opacity-0 shadow-[0_0_14px_5px_rgba(190,242,100,0.75)]" />
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={label ?? "Insert a step here"}
          title={label}
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
  number,
  first,
  last,
  selected,
  error,
  result,
  waiting,
  outlets,
  openSide,
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
  openSide: Side | null; // which outlet's step picker is open
  onBranch: (side: Side) => void;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { block, params } = detectBlock(step);
  const Icon = block.icon;
  const isIf = step.kind === "condition";
  const skipped = result?.status === "skipped";

  return (
    <div
      data-node={step.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => selectOnKey(e, onSelect)}
      className={cn(
        "js-rise group relative w-60 shrink-0 cursor-pointer rounded-2xl border p-3.5 outline-none transition-[border-color,box-shadow] focus-visible:ring-4 focus-visible:ring-ink/20",
        // An If is the one dark node, so forks stand out on the canvas.
        isIf ? "bg-ink text-white" : "bg-white",
        selected ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : isIf ? "border-ink" : "border-ink/10 hover:border-ink/30",
        error && !selected && "border-red-300",
        (waiting || skipped) && "opacity-55",
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink", block.ai || step.kind === "llm_call" ? "bg-accent" : "bg-mint")}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-mono text-[10px] uppercase", isIf ? "text-white/55" : "text-ink/45")}>
            {number} · {kindLabel(step)}
          </p>
          <p className="truncate text-sm">{step.name.trim() || "Untitled step"}</p>
        </div>
      </div>
      <p className={cn("mt-2.5 truncate text-xs", isIf ? "text-white/60" : "text-ink/50", block.key === "custom" && "font-mono")}>{block.summary(params, step)}</p>

      {/* Test-run status badge */}
      {result && (
        <span className="absolute -right-2.5 -top-2.5 flex items-center gap-1.5 rounded-full bg-white py-1 pl-2 pr-1 font-mono text-[10px] text-ink/55 shadow-sm ring-1 ring-ink/10">
          {skipped ? "skipped" : result.finishedAt && formatDuration(new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime())}
          <StatusIcon status={result.status} className="h-4 w-4" />
        </span>
      )}

      {/* Move / remove: above the node on hover (the padding bridges the gap so hover isn't lost) */}
      {!result && (
        <div className={cn("absolute bottom-full right-0 pb-2 text-ink", selected ? "block" : "hidden group-hover:block group-focus-within:block")}>
          <div className="flex gap-0.5 rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-ink/10">
            <IconButton label="Move left" disabled={first} onClick={() => onMove(-1)}>
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label="Move right" disabled={last} onClick={() => onMove(1)}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <IconButton label={isIf ? "Remove this If and its paths" : "Remove step"} danger onClick={onRemove}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      )}

      {/* Free outlets: pipes sticking out of the top and bottom, capped with ⊕. Another step can take this one's output. */}
      {outlets !== null && !result && (
        <>
          <Outlet side="top" outlets={outlets} open={openSide === "top"} onClick={() => onBranch("top")} />
          <Outlet side="bottom" outlets={outlets} open={openSide === "bottom"} onClick={() => onBranch("bottom")} />
        </>
      )}

      {/* Below the node: what's wrong, or what the step produced (dropped below the bottom outlet) */}
      <div className={cn("pointer-events-none absolute left-0 top-full z-10 w-full pt-2.5", outlets !== null && !result && "pt-14")}>
        {error && (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-red-700">
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} /> {error}
          </p>
        )}
        {result?.error && <PopIn className="rounded-xl bg-red-50 px-3 py-2 font-mono text-[11px] leading-snug text-red-700">{result.error}</PopIn>}
        {result && !skipped && result.output !== undefined && (
          <PopIn className="max-h-20 overflow-hidden rounded-xl bg-ink px-3 py-2 font-mono text-[11px] leading-relaxed text-white/85">
            {resultText(result)}
          </PopIn>
        )}
      </div>
    </div>
  );
}

// One outlet: a short pipe out of the middle of a node's top or bottom edge, capped with ⊕.
function Outlet({ side, outlets, open, onClick }: { side: Side; outlets: number; open: boolean; onClick: () => void }) {
  const top = side === "top";
  return (
    <div className={cn("absolute left-1/2 flex -translate-x-1/2 items-center", top ? "bottom-full flex-col-reverse" : "top-full flex-col")}>
      <span className="pipe-y relative h-5 w-3">
        {/* Chevrons pointing away from the node, the way the data goes */}
        <span className={cn("pipe-flow-y pointer-events-none absolute inset-0", top && "rotate-180")} />
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // don't also select the step
          onClick();
        }}
        aria-label={`Add a branch ${top ? "above" : "below"} (${outlets} of ${MAX_OUTLETS} used)`}
        title={`Add a branch ${top ? "above" : "below"}: another step that gets this one's output (${outlets} of ${MAX_OUTLETS} used)`}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border transition-all",
          top ? "-mb-0.5" : "-mt-0.5",
          open ? "rotate-45 border-ink bg-accent" : "border-ink/20 bg-paper hover:scale-110 hover:border-ink hover:bg-accent",
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// Paths that end side by side only join when you say so: this adds the step that gets all their results.
function JoinButton({ slot, insertAt, onOpenInsert }: { slot: Slot; insertAt: Slot | null; onOpenInsert: (slot: Slot | null) => void }) {
  const open = sameSlot(insertAt, slot);
  return (
    <button
      type="button"
      onClick={() => onOpenInsert(open ? null : slot)}
      title="Add a step that runs after these paths and gets their results"
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border border-dashed px-4 text-xs transition-colors",
        open ? "border-ink bg-accent" : "border-ink/30 bg-white hover:border-ink hover:bg-accent",
      )}
    >
      <Merge className="h-3.5 w-3.5" strokeWidth={2} /> Join paths into one step
    </button>
  );
}

// Hangs under a fork without changing its height (the pipes meet at its middle): the explicit
// "Join paths" button when nothing follows the fork yet, and any problem with the branches.
function BelowFork({ join, error, ctx }: { join?: Slot; error?: string; ctx: LaneContext }) {
  if (!join && !error) return null;
  return (
    <div data-nopan className="absolute left-8 top-full -mt-8 flex flex-col items-start gap-2">
      {join && <JoinButton slot={join} insertAt={ctx.insertAt} onOpenInsert={ctx.onOpenInsert} />}
      {error && (
        <p className="flex w-72 items-start gap-1.5 text-xs leading-snug text-red-700">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} /> {error}
        </p>
      )}
    </div>
  );
}
