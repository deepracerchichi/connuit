import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Braces, KeyRound, Layers, RotateCcw, ShieldCheck, Webhook } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Tone = "dim" | "ok" | "fail" | "plain";
type LogLine = { tag: string; text: string; tone: Tone };

// A run's life as the backend actually handles it: queued from a webhook, a failed
// attempt, a BullMQ retry (the whole run re-runs under the same run id), then success.
const LOG: LogLine[] = [
  { tag: "POST", text: "/webhooks/7f3a…c21e", tone: "plain" },
  { tag: "202", text: "Accepted · run 9c1e queued", tone: "ok" },
  { tag: "worker", text: "picked up run 9c1e · attempt 1/3", tone: "dim" },
  { tag: "step 1", text: "http_request GET api.github.com · 200 · 312ms", tone: "plain" },
  { tag: "step 2", text: "llm_call · failed: model timed out", tone: "fail" },
  { tag: "queue", text: "retrying in 2s (exponential backoff)", tone: "dim" },
  { tag: "worker", text: "run 9c1e · attempt 2/3", tone: "dim" },
  { tag: "step 1", text: "http_request GET api.github.com · 200 · 298ms", tone: "plain" },
  { tag: "step 2", text: "llm_call · ok · 1.9s", tone: "plain" },
  { tag: "step 3", text: "http_request POST hooks.slack.com · 200 · 141ms", tone: "plain" },
  { tag: "done", text: "run 9c1e succeeded · 3 steps saved to history", tone: "ok" },
];

const TONE_CLASS: Record<Tone, string> = {
  dim: "text-white/45",
  ok: "text-accent",
  fail: "text-red-300",
  plain: "text-white/85",
};

const SPECS = [
  {
    icon: RotateCcw,
    title: "Retries before it gives up",
    body: "Runs live in a Redis-backed queue. A failed run retries with exponential backoff, and one that never recovers is marked failed, not lost.",
    spec: "BullMQ · backoff 2s → 4s",
  },
  {
    icon: KeyRound,
    title: "Secrets you can't read back",
    body: "API keys are encrypted the moment you save them and only decrypted inside the worker while a run needs them.",
    spec: "AES-256-GCM · never returned by the API",
  },
  {
    icon: Braces,
    title: "Steps that pass notes",
    body: "Each step's output flows into the next. Placeholders are filled safely in URLs, headers and request bodies.",
    spec: "{{previousOutput}} · {{credential}}",
  },
  {
    icon: Webhook,
    title: "Three ways to start",
    body: "Click run, set a cron schedule, or give another app a private webhook URL. Webhook payloads become the first step's input.",
    spec: "manual · cron · webhook tokens",
  },
  {
    icon: ShieldCheck,
    title: "Checked at the door",
    body: "Every request body is validated before it reaches the database, and every workflow is scoped to the user who owns it.",
    spec: "Zod schemas · JWT auth",
  },
  {
    icon: Layers,
    title: "Passwords done properly",
    body: "Passwords are hashed with bcrypt and never stored or sent back. Sessions are signed tokens that expire on their own.",
    spec: "bcrypt cost 12 · 7-day JWT",
  },
];

export default function UnderTheHood() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const section = sectionRef.current;
    if (!section) return;
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Cards rise in as the grid scrolls into view.
      gsap.from(".js-hood-card", {
        autoAlpha: 0,
        y: 40,
        duration: 0.8,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-hood-grid", start: "top 75%", once: true },
      });

      // The log prints line by line, like a real worker writing it.
      const lines = gsap.utils.toArray<HTMLElement>(".js-hood-line", section);
      gsap.set(lines, { autoAlpha: 0, y: 6 });
      gsap.to(lines, {
        autoAlpha: 1,
        y: 0,
        duration: 0.25,
        stagger: 0.32,
        ease: "power2.out",
        delay: 0.4,
        scrollTrigger: { trigger: ".js-hood-terminal", start: "top 70%", once: true },
      });
    });

    return () => mm.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} id="under-the-hood" className="relative z-10 rounded-3xl bg-paper text-ink">
      <div className="flex flex-col gap-6 px-5 pt-24 md:flex-row md:items-end md:justify-between md:px-15 md:pt-36">
        <div>
          <div className="inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
            <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
            Under the hood
          </div>
          <h2 className="mt-8 max-w-3xl text-5xl tracking-tight md:text-7xl">Built like infrastructure, not a demo.</h2>
        </div>
        <p className="max-w-sm text-lg leading-relaxed text-ink/70">
          For the engineers in the room: here's what happens after you press run.
        </p>
      </div>

      <div className="js-hood-grid grid gap-4 px-5 pb-24 pt-12 md:grid-cols-2 md:px-15 md:pb-36 md:pt-16 lg:grid-cols-4">
        {/* Terminal: spans two columns and two rows on large screens */}
        <div className="js-hood-card js-hood-terminal overflow-hidden rounded-2xl bg-ink text-white md:col-span-2 lg:row-span-2">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="ml-3 font-mono text-xs text-white/45">conduit-worker · run log</span>
          </div>
          <ol className="flex flex-col gap-2 overflow-x-auto p-5 font-mono text-xs leading-relaxed md:p-6 md:text-sm">
            {LOG.map((line, i) => (
              <li key={i} className="js-hood-line flex gap-4 md:whitespace-nowrap">
                <span className="w-14 shrink-0 text-white/35">{line.tag}</span>
                <span className={TONE_CLASS[line.tone]}>{line.text}</span>
              </li>
            ))}
            <li className="js-hood-line flex gap-4">
              <span className="w-14 shrink-0" />
              <span className="h-4 w-2 animate-pulse bg-accent" />
            </li>
          </ol>
        </div>

        {SPECS.map(({ icon: Icon, title, body, spec }, i) => (
          <article
            key={title}
            // The last two cards share the row under the terminal, half width each.
            className={`js-hood-card flex flex-col rounded-2xl border border-ink/10 bg-white p-6 ${i >= SPECS.length - 2 ? "lg:col-span-2" : ""}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h3 className="mt-6 text-xl tracking-tight">{title}</h3>
            <p className="mt-2 leading-relaxed text-ink/65">{body}</p>
            <p className="mt-auto pt-6 font-mono text-xs text-ink/50">{spec}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
