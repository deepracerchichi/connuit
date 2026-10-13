import { useRef, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, ChevronDown, CircleCheck, CircleX, Clock, LoaderCircle, Lock, Play, Plus, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";

gsap.registerPlugin(ScrollTrigger);

export type VisualKind = "connect" | "steps" | "triggers" | "runs";

export function Visual({ kind }: { kind: VisualKind }) {
  if (kind === "connect") return <ConnectVisual />;
  if (kind === "steps") return <StepsVisual />;
  if (kind === "triggers") return <TriggersVisual />;
  return <RunsVisual />;
}

/* ---------- Shared: the stage, the cursor, and a tiny scene "script" API ---------- */

// A card sitting on top of another one gets a deep, soft shadow.
const FRONT_SHADOW = "shadow-[0_24px_60px_-12px_rgba(14,66,41,0.28)]";

type Scene = {
  tl: gsap.core.Timeline;
  $: (selector: string) => HTMLElement;
  moveTo: (target: HTMLElement, position?: gsap.Position, fx?: number, fy?: number) => void;
  moveHome: (position?: gsap.Position) => void;
  click: (target?: HTMLElement) => void;
  hold: (seconds: number) => void;
};

// Where a point on `target` sits inside `stage`, in the stage's own pixels.
// The whole card gets scaled down when the next one covers it, so divide that out.
function pointIn(stage: HTMLElement, target: HTMLElement, fx: number, fy: number) {
  const s = stage.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const k = s.width / stage.offsetWidth || 1;
  return { x: (t.left - s.left + t.width * fx) / k, y: (t.top - s.top + t.height * fy) / k };
}

// Builds one looping clip. It plays while the stage is on screen and pauses when it isn't.
// Reduced-motion users get the finished frame (the "done" label) and no movement.
function useScene(script: (scene: Scene) => void) {
  const stageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const $ = (selector: string) => stage.querySelector<HTMLElement>(selector)!;
    const cursor = $(".js-cursor");

    // Cursor positions are measured from the layout, so re-measure every loop
    // (the layout may have changed size since the last one).
    const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.4, onRepeat: () => { tl.invalidate(); } });

    const home = () => ({ x: stage.offsetWidth * 0.86, y: stage.offsetHeight * 0.9 });
    tl.set(cursor, { x: () => home().x, y: () => home().y, scale: 1, opacity: 1, transformOrigin: "0 0" }, 0);

    script({
      tl,
      $,
      moveTo: (target, position, fx = 0.5, fy = 0.55) => {
        tl.to(cursor, {
          x: () => pointIn(stage, target, fx, fy).x,
          y: () => pointIn(stage, target, fx, fy).y,
          duration: 0.9,
          ease: "power3.inOut",
        }, position);
      },
      moveHome: (position) => {
        tl.to(cursor, { x: () => home().x, y: () => home().y, duration: 0.9, ease: "power3.inOut" }, position);
      },
      click: (target) => {
        tl.to(cursor, { scale: 0.8, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" });
        if (target) tl.to(target, { scale: 0.96, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<");
      },
      hold: (seconds) => {
        tl.to({}, { duration: seconds });
      },
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tl.seek("done");
      return;
    }

    ScrollTrigger.create({
      trigger: stage,
      start: "top 85%",
      end: "bottom 15%",
      onEnter: () => tl.invalidate().restart(),
      onEnterBack: () => tl.play(),
      onLeave: () => tl.pause(),
      onLeaveBack: () => tl.pause(),
    });
  }, { scope: stageRef });

  return stageRef;
}

function Stage({ stageRef, children }: { stageRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="relative h-110 select-none overflow-hidden rounded-3xl bg-mint md:h-140"
    >
      {children}
      <svg className="js-cursor pointer-events-none absolute left-0 top-0 z-30 -ml-1 -mt-0.5 h-6 w-6 opacity-0 drop-shadow-md" viewBox="0 0 24 24">
        <path
          d="M4 2v17l4.5-4.5 3 6.5 2.5-1-3-6.5H17.5Z"
          fill="#0e4229"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ---------- 1. Connect: paste a Slack webhook, save, it lands in the list encrypted ---------- */

function ConnectVisual() {
  const stageRef = useScene(({ tl, $, moveTo, moveHome, click, hold }) => {
    const modal = $(".js-modal");
    const field = $(".js-url");
    const typed = $(".js-typed");
    const dots = $(".js-dots");
    const save = $(".js-save");
    const saveIdle = $(".js-save-idle");
    const saveDone = $(".js-save-done");
    const newRow = $(".js-new-row");

    tl.set(modal, { autoAlpha: 0, y: 24 }, 0)
      .set(typed, { clipPath: "inset(0 100% 0 0)", autoAlpha: 1 }, 0)
      .set([dots, saveDone], { autoAlpha: 0 }, 0)
      .set(saveIdle, { autoAlpha: 1 }, 0)
      .set(newRow, { autoAlpha: 0, y: 12 }, 0)
      .to(modal, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.1);

    moveTo(field, 0.5, 0.3);
    click(field);
    tl.to(typed, { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "steps(26)" });

    moveTo(save, "+=0.2");
    click(save);
    tl.to(typed, { autoAlpha: 0, duration: 0.2 })
      .to(dots, { autoAlpha: 1, duration: 0.2 }, "<")
      .to(saveIdle, { autoAlpha: 0, duration: 0.2 }, "<")
      .to(saveDone, { autoAlpha: 1, duration: 0.2 }, "<")
      .to(modal, { autoAlpha: 0, y: 24, duration: 0.5, ease: "power2.in" }, "+=0.7");
    moveHome("<");
    tl.to(newRow, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, "-=0.4");

    tl.addLabel("done");
    hold(2.4);
    tl.to(newRow, { autoAlpha: 0, duration: 0.3 });
  });

  return (
    <Stage stageRef={stageRef}>
      <div className="absolute left-[10%] top-[8%] w-full rounded-2xl bg-white p-6 md:p-8">
        <p className="text-xl md:text-2xl">Credentials</p>
        <div className="mt-4 flex flex-col divide-y divide-ink/10">
          <CredentialRow name="OpenAI" detail="API key" />
          <CredentialRow name="Weather service" detail="API key" />
          <CredentialRow name="Slack" detail="Incoming webhook" className="js-new-row" />
        </div>
      </div>

      <div className={cn("js-modal absolute bottom-[7%] left-[5%] w-[88%] max-w-105 rounded-2xl bg-white p-6 md:left-[8%]", FRONT_SHADOW)}>
        <p className="text-xl">Add credential</p>

        <span className="mt-5 block text-sm text-ink/50">Service</span>
        <div className="mt-1.5 flex items-center justify-between rounded-lg border border-ink/15 px-3 py-2.5 text-sm">
          Slack <ChevronDown className="h-4 w-4 text-ink/50" strokeWidth={1.75} />
        </div>

        <span className="mt-4 block text-sm text-ink/50">Webhook URL</span>
        <div className="js-url relative mt-1.5 h-10 overflow-hidden rounded-lg border border-ink/15 text-sm">
          <span className="js-typed absolute inset-y-0 left-3 flex items-center whitespace-nowrap">
            https://hooks.slack.com/services/T04…
          </span>
          <span className="js-dots invisible absolute inset-y-0 left-3 flex items-center tracking-widest opacity-0">
            ••••••••••••••••••
          </span>
        </div>

        <div className="mt-6 flex justify-end gap-2 text-sm">
          <span className="rounded-lg px-4 py-2 text-ink/60">Cancel</span>
          <span className="js-save grid rounded-lg bg-ink px-4 py-2 text-white">
            <span className="js-save-idle col-start-1 row-start-1">Save</span>
            <span className="js-save-done invisible col-start-1 row-start-1 inline-flex items-center gap-1.5 opacity-0">
              <Check className="h-3.5 w-3.5" strokeWidth={2} /> Saved
            </span>
          </span>
        </div>
      </div>
    </Stage>
  );
}

function CredentialRow({ name, detail, className }: { name: string; detail: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3.5 pr-[14%]", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mint">
          <Lock className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <div className="text-sm md:text-base">{name}</div>
          <div className="text-xs text-ink/50">{detail}</div>
        </div>
      </div>
      <span className="rounded-full bg-accent/60 px-2.5 py-1 text-xs">Encrypted</span>
    </div>
  );
}

/* ---------- 2. Steps: add a step, then see what the AI step decided ---------- */

function StepsVisual() {
  const stageRef = useScene(({ tl, $, moveTo, moveHome, click, hold }) => {
    const add = $(".js-add");
    const ai = $(".js-ai");
    const newStepWrap = $(".js-new-step");
    const output = $(".js-output");
    const thinking = $(".js-thinking");
    const answer = $(".js-answer");

    tl.set(newStepWrap, { height: 0, autoAlpha: 0 }, 0)
      .set(output, { autoAlpha: 0, y: 16 }, 0)
      .set(thinking, { autoAlpha: 1 }, 0)
      .set(answer, { autoAlpha: 0 }, 0);

    moveTo(add, 0.4, 0.3);
    click(add);
    tl.to(newStepWrap, { height: "auto", duration: 0.5, ease: "power3.out" })
      .to(newStepWrap, { autoAlpha: 1, duration: 0.4 }, "<0.15");

    moveTo(ai, "+=0.3", 0.75, 0.5);
    click(ai);
    tl.to(output, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" })
      .to(thinking.children, { opacity: 0.35, duration: 0.35, stagger: 0.1, yoyo: true, repeat: 3 }, "<")
      .to(thinking, { autoAlpha: 0, duration: 0.2 })
      .to(answer, { autoAlpha: 1, duration: 0.4 });
    moveHome("<");

    tl.addLabel("done");
    hold(2.6);
    tl.to(output, { autoAlpha: 0, y: 16, duration: 0.4 })
      .to(newStepWrap, { height: 0, autoAlpha: 0, duration: 0.4 }, "<");
  });

  return (
    <Stage stageRef={stageRef}>
      <div className="absolute left-[5%] top-[7%] w-[90%] max-w-120 rounded-2xl bg-white p-6 md:left-[8%] md:p-8">
        <p className="text-xl md:text-2xl">Morning briefing</p>
        <div className="mt-5">
          <StepCard n={1} name="Fetch new posts" detail="Calls the blog's API" />
          <Connector />
          <StepCard n={2} name="Summarize with AI" detail="Reads step 1, picks what matters" className="js-ai" />
          <div className="js-new-step overflow-hidden">
            <Connector />
            <StepCard n={3} name="Post to Slack" detail="Sends the summary to #team" />
          </div>
          <span className="js-add mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-ink/30 px-3 py-2 text-sm text-ink/70">
            <Plus className="h-4 w-4" strokeWidth={1.75} /> Add step
          </span>
        </div>
      </div>

      <div className={cn("js-output invisible absolute bottom-[6%] right-[5%] w-[72%] max-w-85 rounded-2xl bg-white p-5 opacity-0", FRONT_SHADOW)}>
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Step 2 output
        </div>
        <div className="relative mt-3 min-h-18">
          <div className="js-thinking absolute inset-0 flex flex-col gap-2.5 pt-1">
            <span className="h-2.5 w-full rounded-full bg-ink/10" />
            <span className="h-2.5 w-4/5 rounded-full bg-ink/10" />
            <span className="h-2.5 w-3/5 rounded-full bg-ink/10" />
          </div>
          <p className="js-answer invisible leading-snug opacity-0">
            2 of 14 new posts are worth your time: the pricing change and the outage report.
          </p>
        </div>
      </div>
    </Stage>
  );
}

function StepCard({ n, name, detail, className }: { n: number; name: string; detail: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-ink/10 px-4 py-3", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint text-sm">{n}</span>
      <div>
        <div className="text-sm md:text-base">{name}</div>
        <div className="text-xs text-ink/50">{detail}</div>
      </div>
    </div>
  );
}

function Connector() {
  return <div className="ml-8 h-5 w-px bg-ink/20" />;
}

/* ---------- 3. Triggers: switch from manual to a daily schedule ---------- */

function TriggersVisual() {
  const stageRef = useScene(({ tl, $, moveTo, moveHome, click, hold }) => {
    const modal = $(".js-modal");
    const manual = $(".js-opt-manual");
    const schedule = $(".js-opt-schedule");
    const scheduleFields = $(".js-schedule-fields");
    const save = $(".js-save");
    const statusOff = $(".js-status-off");
    const statusOn = $(".js-status-on");
    const selected = (option: HTMLElement) => option.querySelectorAll(".js-sel, .js-dot");

    tl.set(modal, { autoAlpha: 0, y: 24 }, 0)
      .set(selected(manual), { opacity: 1 }, 0)
      .set(selected(schedule), { opacity: 0 }, 0)
      .set(scheduleFields, { height: 0 }, 0)
      .set(statusOff, { autoAlpha: 1 }, 0)
      .set(statusOn, { autoAlpha: 0 }, 0)
      .to(modal, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.1);

    moveTo(schedule, 0.5, 0.35, 0.5);
    click(schedule);
    tl.to(selected(manual), { opacity: 0, duration: 0.25 })
      .to(selected(schedule), { opacity: 1, duration: 0.25 }, "<")
      .to(scheduleFields, { height: "auto", duration: 0.45, ease: "power3.out" }, "<");

    moveTo(save, "+=0.4");
    click(save);
    tl.to(modal, { autoAlpha: 0, y: 24, duration: 0.5, ease: "power2.in" }, "+=0.3");
    moveHome("<");
    tl.to(statusOff, { autoAlpha: 0, duration: 0.25 }, "-=0.3")
      .fromTo(statusOn, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)", immediateRender: false });

    tl.addLabel("done");
    hold(2.4);
    tl.to(statusOn, { autoAlpha: 0, duration: 0.3 })
      .to(statusOff, { autoAlpha: 1, duration: 0.3 });
  });

  return (
    <Stage stageRef={stageRef}>
      <div className="absolute left-[12%] top-[7%] w-full rounded-2xl bg-white p-6 md:p-8">
        <p className="text-xl md:text-2xl">Morning briefing</p>
        <div className="mt-3 grid text-sm">
          <span className="js-status-off col-start-1 row-start-1 inline-flex w-fit items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5 text-ink/60">
            <span className="h-2 w-2 rounded-full bg-ink/30" /> Runs when you click Run
          </span>
          <span className="js-status-on invisible col-start-1 row-start-1 inline-flex w-fit items-center gap-2 rounded-full bg-accent/60 px-3 py-1.5 opacity-0">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} /> Runs every day at 9:00
          </span>
        </div>
        <p className="mt-5 pr-[20%] text-sm text-ink/50">
          Fetch new posts → Summarize with AI → Post to Slack
        </p>
      </div>

      <div className={cn("js-modal absolute bottom-[6%] left-[5%] w-[90%] max-w-110 rounded-2xl bg-white p-6 md:left-[8%]", FRONT_SHADOW)}>
        <p className="text-xl">When should this run?</p>
        <div className="mt-4 flex flex-col gap-2">
          <TriggerOption label="Only when I click Run" selected className="js-opt-manual" />
          <TriggerOption label="On a schedule" className="js-opt-schedule">
            <div className="js-schedule-fields overflow-hidden">
              <div className="flex gap-2 pt-3 text-sm">
                <span className="rounded-lg border border-ink/15 bg-white px-3 py-2">Every day</span>
                <span className="rounded-lg border border-ink/15 bg-white px-3 py-2">at 09:00</span>
              </div>
            </div>
          </TriggerOption>
          <TriggerOption label="When another app calls it" />
        </div>
        <div className="mt-5 flex justify-end">
          <span className="js-save rounded-lg bg-ink px-4 py-2 text-sm text-white">Save</span>
        </div>
      </div>
    </Stage>
  );
}

function TriggerOption({ label, selected = false, className, children }: { label: string; selected?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative rounded-xl border border-ink/10 px-4 py-3", className)}>
      {/* Selected look is a separate layer, so it fades with opacity instead of tweening colors. */}
      <div className={cn("js-sel absolute inset-0 rounded-xl border-[1.5px] border-ink bg-mint/40", !selected && "opacity-0")} />
      <div className="relative flex items-center gap-3 text-sm">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink/40">
          <span className={cn("js-dot h-2 w-2 rounded-full bg-ink", !selected && "opacity-0")} />
        </span>
        {label}
      </div>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

/* ---------- 4. Runs: click Run, steps tick off, one fails and is retried ---------- */

function RunsVisual() {
  const stageRef = useScene(({ tl, $, moveTo, moveHome, click, hold }) => {
    const run = $(".js-run");
    const result = $(".js-result");
    const [fetchRow, aiRow, slackRow] = [".js-row-1", ".js-row-2", ".js-row-3"].map($);
    const part = (row: HTMLElement, selector: string) => row.querySelector<HTMLElement>(selector);

    [fetchRow, aiRow, slackRow].forEach((row) => {
      tl.set(row.querySelectorAll(".js-spin, .js-fail, .js-ok, .js-sub-retry, .js-sub-done"), { opacity: 0 }, 0)
        .set(row.querySelectorAll(".js-wait, .js-sub-wait"), { opacity: 1 }, 0);
    });
    tl.set(result, { autoAlpha: 0, y: 8 }, 0);

    const spin = (row: HTMLElement, from: string, seconds: number) => {
      tl.to(part(row, from), { opacity: 0, duration: 0.15 })
        .to(part(row, ".js-spin"), { opacity: 1, duration: 0.15 }, "<")
        .fromTo(part(row, ".js-spin"), { rotation: 0 }, { rotation: 420 * seconds, duration: seconds, ease: "none", immediateRender: false }, "<");
    };
    const swap = (row: HTMLElement, icon: string, oldSub: string, newSub: string) => {
      tl.to(part(row, ".js-spin"), { opacity: 0, duration: 0.15 })
        .to(part(row, icon), { opacity: 1, duration: 0.2 }, "<")
        .to(part(row, oldSub), { opacity: 0, duration: 0.15 }, "<")
        .to(part(row, newSub), { opacity: 1, duration: 0.2 }, "<");
    };

    moveTo(run, 0.4);
    click(run);
    moveHome("+=0.1");

    spin(fetchRow, ".js-wait", 0.6);
    swap(fetchRow, ".js-ok", ".js-sub-wait", ".js-sub-done");

    spin(aiRow, ".js-wait", 0.9);
    swap(aiRow, ".js-fail", ".js-sub-wait", ".js-sub-retry");
    hold(0.8);
    spin(aiRow, ".js-fail", 0.8);
    swap(aiRow, ".js-ok", ".js-sub-retry", ".js-sub-done");

    spin(slackRow, ".js-wait", 0.6);
    swap(slackRow, ".js-ok", ".js-sub-wait", ".js-sub-done");

    tl.to(result, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" });

    tl.addLabel("done");
    hold(2.4);
    tl.to(result, { autoAlpha: 0, duration: 0.3 });
  });

  const history = [
    { id: 4820, status: "Succeeded", ok: true },
    { id: 4819, status: "Retried once, then succeeded", ok: true },
    { id: 4818, status: "Failed after 3 attempts", ok: false },
    { id: 4817, status: "Succeeded", ok: true },
  ];

  return (
    <Stage stageRef={stageRef}>
      <div className="absolute right-[-14%] top-[6%] w-[72%] rounded-2xl bg-white p-6 md:p-8">
        <p className="text-xl md:text-2xl">Run history</p>
        <div className="mt-4 flex flex-col divide-y divide-ink/10">
          {history.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3 text-sm">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", r.ok ? "bg-ink" : "bg-red-500")} />
              <span className="shrink-0">#{r.id}</span>
              <span className="truncate text-ink/50">{r.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("absolute bottom-[6%] left-[5%] w-[90%] max-w-110 rounded-2xl bg-white p-6 md:left-[7%]", FRONT_SHADOW)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl">Morning briefing</p>
            <p className="text-sm text-ink/50">Run #4821</p>
          </div>
          <span className="js-run inline-flex shrink-0 items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm text-white">
            <Play className="h-3.5 w-3.5" strokeWidth={2} /> Run now
          </span>
        </div>

        <div className="mt-4 flex flex-col divide-y divide-ink/10">
          <RunStep name="Fetch new posts" done="Done in 0.6s" className="js-row-1" />
          <RunStep name="Summarize with AI" done="Worked on attempt 2 · 2.9s" retry className="js-row-2" />
          <RunStep name="Post to Slack" done="Done in 0.7s" className="js-row-3" />
        </div>

        <div className="js-result invisible mt-4 inline-flex items-center gap-2 rounded-full bg-accent/60 px-3 py-1.5 text-sm opacity-0">
          <CircleCheck className="h-4 w-4" strokeWidth={1.75} /> Succeeded in 4.2s
        </div>
      </div>
    </Stage>
  );
}

function RunStep({ name, done, retry = false, className }: { name: string; done: string; retry?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      <span className="relative h-5 w-5 shrink-0">
        <span className="js-wait absolute inset-0.5 rounded-full border-[1.5px] border-ink/25" />
        <LoaderCircle className="js-spin absolute inset-0 h-5 w-5 text-ink/60 opacity-0" strokeWidth={1.75} />
        {retry && <CircleX className="js-fail absolute inset-0 h-5 w-5 text-red-500 opacity-0" strokeWidth={1.75} />}
        <CircleCheck className="js-ok absolute inset-0 h-5 w-5 opacity-0" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="text-sm md:text-base">{name}</div>
        <div className="relative h-4 text-xs text-ink/50">
          <span className="js-sub-wait absolute left-0 top-0 whitespace-nowrap">Waiting</span>
          {retry && <span className="js-sub-retry absolute left-0 top-0 whitespace-nowrap text-red-600 opacity-0">Failed, retrying in 2s</span>}
          <span className="js-sub-done absolute left-0 top-0 whitespace-nowrap opacity-0">{done}</span>
        </div>
      </div>
    </div>
  );
}
