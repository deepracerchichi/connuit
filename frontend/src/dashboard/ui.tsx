import { useRef, type ReactNode, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleAlert, CircleCheck, CircleX, Clock, LoaderCircle, Play, RotateCw, Webhook } from "lucide-react";
import type { Run, RunStatus, Trigger } from "../api/types";
import { cn } from "../lib/cn";

/* ---------- Page header: same tag + big heading as the landing sections ---------- */

export function PageHeader({ tag, title, subtitle, action }: { tag: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="js-rise inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
          <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
          {tag}
        </span>
        <h1 className="js-rise mt-6 text-5xl tracking-tight md:text-6xl">{title}</h1>
        {subtitle && <p className="js-rise mt-3 max-w-xl text-lg text-ink/60">{subtitle}</p>}
      </div>
      {action && <div className="js-rise shrink-0">{action}</div>}
    </header>
  );
}

/* ---------- Content rises in once it has loaded (same feel as the auth pages) ---------- */

// Runs on arrival (the header rises) and again when `ready` flips (the loaded content rises).
// Each element is marked once it has risen, so nothing already on screen animates twice.
export function useRise<T extends HTMLElement>(ready: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  useGSAP(() => {
    if (!ref.current) return;
    const fresh = ref.current.querySelectorAll<HTMLElement>(".js-rise:not([data-risen])");
    fresh.forEach((el) => (el.dataset.risen = ""));
    if (fresh.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(fresh, { autoAlpha: 0, y: 20, duration: 0.6, stagger: 0.04, ease: "power3.out" });
  }, { dependencies: [ready], scope: ref });
  return ref;
}

/* ---------- Run status ---------- */

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

export function StatusIcon({ status, className }: { status: RunStatus; className?: string }) {
  const size = cn("h-4 w-4 shrink-0", className);
  if (status === "succeeded") return <CircleCheck className={size} strokeWidth={2} />;
  if (status === "failed") return <CircleX className={cn(size, "text-red-600")} strokeWidth={2} />;
  return <LoaderCircle className={cn(size, "animate-spin text-ink/60")} strokeWidth={2} />;
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm",
        status === "succeeded" && "bg-accent/60",
        status === "failed" && "bg-red-50 text-red-700",
        (status === "running" || status === "pending") && "bg-ink/5",
      )}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ---------- Triggers ---------- */

// Turns the common cron shapes into words; anything unusual is shown as-is.
export function describeCron(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, month, dow] = parts;
  const time = /^\d+$/.test(min) && /^\d+$/.test(hour) ? `${hour}:${min.padStart(2, "0")}` : null;
  const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

  if (min.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*") return `Every ${min.slice(2)} minutes`;
  if (min === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") return "Every minute";
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*") return "Every hour";
  if (time && dom === "*" && month === "*" && dow === "*") return `Every day at ${time}`;
  if (time && dom === "*" && month === "*" && dow === "1-5") return `Weekdays at ${time}`;
  if (time && dom === "*" && month === "*" && /^[0-6]$/.test(dow)) return `${days[Number(dow)]} at ${time}`;
  return schedule;
}

export function TriggerBadge({ trigger }: { trigger: Trigger }) {
  const { icon: Icon, label } =
    trigger.type === "cron"
      ? { icon: Clock, label: describeCron(trigger.schedule) }
      : trigger.type === "webhook"
        ? { icon: Webhook, label: "Webhook" }
        : { icon: Play, label: "Manual" };

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5 text-sm">
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}

/* ---------- Time ---------- */

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// A finished run's last update is when it finished.
export function runDuration(run: Run): string | null {
  if (run.status !== "succeeded" && run.status !== "failed") return null;
  return formatDuration(new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime());
}

export function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/* ---------- Empty / error / loading ---------- */

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="js-rise flex flex-col items-center rounded-2xl border border-dashed border-ink/20 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-mint">{icon}</span>
      <h3 className="mt-5 text-2xl tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-ink/60">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-3">
        <CircleAlert className="h-5 w-5 shrink-0" strokeWidth={2} />
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm transition-colors hover:bg-red-100"
      >
        <RotateCw className="h-3.5 w-3.5" strokeWidth={2} /> Try again
      </button>
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink/5" />
      ))}
    </div>
  );
}
