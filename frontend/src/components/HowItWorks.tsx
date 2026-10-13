import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Visual, type VisualKind } from "./HowItWorksVisuals";

gsap.registerPlugin(ScrollTrigger);


const STEPS: { title: string; body: string; spec: string; visual: VisualKind }[] = [
  {
    title: "Connect your tools",
    body: "Link the apps you already use, once. Your logins stay locked away and are only used when a workflow runs.",
    spec: "Credentials encrypted with AES-256-GCM · never shown again after saving",
    visual: "connect",
  },
  {
    title: "Line up the steps",
    body: "Decide what should happen, in order. Any step can fetch information, or ask AI to read it and decide what comes next.",
    spec: "HTTP requests · LLM steps · each step's output flows into the next",
    visual: "steps",
  },
  {
    title: "Choose when it runs",
    body: "Run it yourself, on a schedule, or the moment something happens in another app.",
    spec: "Manual runs · cron schedules · webhooks with unique private URLs",
    visual: "triggers",
  },
  {
    title: "See everything that happened",
    body: "Every run is saved step by step, and if something fails, Conduit tries again on its own.",
    spec: "Durable job queue · automatic retries with backoff · full run history",
    visual: "runs",
  },
];

const SCALE_WHEN_COVERED = 0.92;
const DIM_WHEN_COVERED = 0.35;

const pad = (n: number) => String(n).padStart(2, "0");

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    // The stacking itself is pure CSS (sticky cards). GSAP only adds depth:
    // a card shrinks and dims while the next one slides over it.
    // Desktop only, and skipped entirely for users who prefer reduced motion.
    const mm = gsap.matchMedia();

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const cards = gsap.utils.toArray<HTMLElement>(".js-hiw-card", sectionRef.current);

      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;

        gsap
          .timeline({
            scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true },
          })
          .to(card, { scale: SCALE_WHEN_COVERED, ease: "none" }, 0)
          .to(card.querySelector(".js-hiw-dim"), { opacity: DIM_WHEN_COVERED, ease: "none" }, 0);
      });
    });

    return () => mm.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} className="relative z-10  bg-paper text-ink">
      <div className="px-5 pb-12 pt-24 md:px-15 md:pb-16 md:pt-36">
        <div className="inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
          <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
          How it works
        </div>
        <h2 className="mt-8 text-5xl tracking-tight md:text-8xl">From idea to autopilot.</h2>
      </div>

      <div>
        {STEPS.map((step, i) => (
          <article
            key={step.title}
            className="js-hiw-card relative origin-top overflow-clip rounded-t-3xl border-t border-ink/10 bg-paper  md:sticky md:top-0 md:min-h-screen"
          >
            <div className="grid gap-8 px-5 pb-12 pt-10 md:gap-10 md:px-15 md:pb-16 md:grid-cols-[1fr_2fr] md:pt-36">
              <div className="flex flex-col gap-5">
                <span className="font-mono text-sm text-ink/50">
                  {pad(i + 1)} / {pad(STEPS.length)}
                </span>
                <h3 className="text-3xl tracking-tight md:text-5xl">{step.title}</h3>
                <p className="text-lg leading-relaxed text-ink/70 md:text-xl">{step.body}</p>
                <p className="font-mono text-xs leading-relaxed text-ink/50">{step.spec}</p>
              </div>

              <Visual kind={step.visual} />
            </div>

            <div className="js-hiw-dim pointer-events-none absolute inset-0 bg-ink opacity-0" />
          </article>
        ))}
      </div>
    </section>
  );
}
