import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Clock, Hash, ListTodo, Mail, Webhook } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Example = {
  title: string;
  body: string;
  trigger: { kind: "schedule" | "webhook"; label: string };
  spec: string;
  outcome: ReactNode;
};

// Straight-line flows: trigger → fetch → AI → send. Nothing here needs branching.
const EXAMPLES: Example[] = [
  {
    title: "Your standup, written for you",
    body: "Every weekday morning it reads what you shipped yesterday and posts your update before you've opened your laptop.",
    trigger: { kind: "schedule", label: "Weekdays at 8:45" },
    spec: "cron → GitHub API → llm_call → Slack",
    outcome: (
      <ChatMessage channel="daily-standup">
        <b className="font-medium">Yesterday:</b> fixed the retry bug in billing and shipped dark mode.{" "}
        <b className="font-medium">Today:</b> finishing CSV export. No blockers.
      </ChatMessage>
    ),
  },
  {
    title: "Rescue failed payments",
    body: "The moment a card is declined, AI writes the customer a warm, personal note instead of a cold system email.",
    trigger: { kind: "webhook", label: "When a Stripe payment fails" },
    spec: "Stripe webhook → llm_call → email API",
    outcome: (
      <EmailPreview to="maya@studio.co" subject="Quick heads-up about your card">
        Hi Maya, your card didn't go through this month. No stress, it happens. Here's a link to update it…
      </EmailPreview>
    ),
  },
  {
    title: "Hear when the internet talks about you",
    body: "Every hour it searches for your product online, reads the mood, and drafts a reply you can post.",
    trigger: { kind: "schedule", label: "Every hour" },
    spec: "cron → Hacker News API → llm_call → Slack",
    outcome: (
      <ChatMessage channel="mentions">
        3 new mentions. Mostly positive, but one person hit a login bug.{" "}
        <b className="font-medium">Draft reply:</b> “Thanks for flagging, a fix ships today.”
      </ChatMessage>
    ),
  },
  {
    title: "Release notes that write themselves",
    body: "Publish a release and your users get plain-English notes, not a list of commit messages.",
    trigger: { kind: "webhook", label: "When you publish a release" },
    spec: "GitHub webhook → llm_call → Discord",
    outcome: (
      <ChatMessage channel="announcements">
        <b className="font-medium">What's new in v2.4:</b> exports are 3× faster, you can schedule reports, and the
        mobile menu finally behaves.
      </ChatMessage>
    ),
  },
  {
    title: "Meetings that end with a to-do list",
    body: "When a call's transcript is ready, AI pulls out who promised what, and the tasks land in your tracker.",
    trigger: { kind: "webhook", label: "When a transcript is ready" },
    spec: "transcript webhook → llm_call → Notion API",
    outcome: (
      <TaskList
        items={[
          { who: "Chi", task: "Send the pricing deck by Friday" },
          { who: "Sam", task: "Book the follow-up with legal" },
          { who: "Ade", task: "Share the onboarding numbers" },
        ]}
      />
    ),
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function WhatYouCanBuild() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const section = sectionRef.current;
    if (!section) return;
    const mm = gsap.matchMedia();

    // Entrance (IntegratedBio style): each card is wiped in from left to right,
    // one after another, then its contents rise into place. Runs once.
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const cards = gsap.utils.toArray<HTMLElement>(".js-build-card", section);

      gsap.set(cards, { clipPath: "inset(0% 100% 0% 0%)" });
      gsap.set(".js-build-reveal", { autoAlpha: 0, y: 24 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: ".js-build-track", start: "top 75%", once: true },
      });

      cards.forEach((card, i) => {
        const at = i * 0.15;
        tl.to(card, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "expo.inOut" }, at)
          .to(card.querySelectorAll(".js-build-reveal"), {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.08,
            ease: "power3.out",
          }, at + 0.55);
      });
    });

    // Desktop: pin the section and turn vertical scrolling into sideways movement.
    // Phones get a native swipe row instead (see the track's classes).
    mm.add("(min-width: 768px)", () => {
      const track = section.querySelector<HTMLElement>(".js-build-track");
      const bar = section.querySelector<HTMLElement>(".js-build-bar");
      if (!track || !bar) return;

      // How far the row has to travel so its last card ends at the right edge.
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

      gsap
        .timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .to(track, { x: () => -distance(), ease: "none" }, 0)
        .to(bar, { scaleX: 1, ease: "none" }, 0);
    });

    return () => mm.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} id="what-you-can-build" className="relative z-10 overflow-hidden  bg-ink text-white">
      <div className="flex flex-col md:h-screen">
        <div className="flex flex-col gap-6 px-5 pt-24 md:flex-row md:items-end md:justify-between md:px-15 md:pt-36">
          <div>
            <div className="inline-flex items-center gap-3 rounded-md bg-white/10 px-3 py-2 font-mono text-sm uppercase">
              <span className="h-3 w-3 bg-accent" />
              What you can build
            </div>
            <h2 className="mt-8 text-5xl tracking-tight md:text-6xl">Things you'd never do by hand.</h2>
          </div>
          <p className="max-w-sm text-lg leading-relaxed text-white/70">
            A trigger, a couple of steps, and AI in the middle. Here's what that adds up to.
          </p>
        </div>

        <div className="md:mt-8 md:flex md:flex-1 md:items-center">
          <div className="js-build-track mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-6 [scrollbar-width:none] md:mt-0 md:w-max md:snap-none md:gap-6 md:overflow-visible md:px-15 md:pb-0">
            {EXAMPLES.map((example, i) => (
              <ExampleCard key={example.title} example={example} index={i} />
            ))}
          </div>
        </div>

        <p className="px-5 pb-16 font-mono text-xs uppercase text-white/40 md:hidden">Swipe for more →</p>

        <div className="relative mx-15 mb-8 hidden h-px bg-white/20 md:block">
          <div className="js-build-bar absolute inset-0 origin-left bg-white" style={{ transform: "scaleX(0)" }} />
        </div>
      </div>
    </section>
  );
}

function ExampleCard({ example, index }: { example: Example; index: number }) {
  const TriggerIcon = example.trigger.kind === "schedule" ? Clock : Webhook;

  return (
    <article className="js-build-card flex w-[85vw] shrink-0 snap-start flex-col bg-accent p-6 text-ink md:w-110 md:p-8">
      <div className="js-build-reveal flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink/10 px-3 py-1.5 text-sm">
          <TriggerIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {example.trigger.label}
        </span>
        <span className="pt-1 font-mono text-sm">{pad(index + 1)}.</span>
      </div>

      <div className="js-build-reveal mt-6">{example.outcome}</div>

      <div className="mt-auto pt-8">
        <h3 className="js-build-reveal text-2xl leading-tight tracking-tight md:text-3xl">{example.title}</h3>
        <p className="js-build-reveal mt-3 leading-relaxed text-ink/75">{example.body}</p>
        <p className="js-build-reveal mt-5 font-mono text-xs text-ink/55">{example.spec}</p>
      </div>
    </article>
  );
}

/* ---------- The result each workflow delivers ---------- */

function OutcomeWindow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_12px_30px_-12px_rgba(14,66,41,0.35)]">
      <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-sm text-ink/60">
        {icon}
        {label}
      </div>
      <div className="pt-3">{children}</div>
    </div>
  );
}

function ChatMessage({ channel, children }: { channel: string; children: ReactNode }) {
  return (
    <OutcomeWindow icon={<Hash className="h-3.5 w-3.5" strokeWidth={2} />} label={channel}>
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-sm text-accent">
          C
        </span>
        <div className="min-w-0 text-sm leading-relaxed">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">Conduit</span>
            <span className="rounded bg-ink/10 px-1 text-[10px] uppercase">App</span>
            <span className="text-xs text-ink/45">8:45 AM</span>
          </div>
          <p className="mt-0.5 text-ink/85">{children}</p>
        </div>
      </div>
    </OutcomeWindow>
  );
}

function EmailPreview({ to, subject, children }: { to: string; subject: string; children: ReactNode }) {
  return (
    <OutcomeWindow icon={<Mail className="h-3.5 w-3.5" strokeWidth={2} />} label={`Sent to ${to}`}>
      <p className="text-sm font-medium">{subject}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink/70">{children}</p>
    </OutcomeWindow>
  );
}

function TaskList({ items }: { items: { who: string; task: string }[] }) {
  return (
    <OutcomeWindow icon={<ListTodo className="h-3.5 w-3.5" strokeWidth={2} />} label="Action items · Weekly sync">
      <ul className="flex flex-col gap-2.5 text-sm">
        {items.map((item) => (
          <li key={item.task} className="flex items-start gap-2.5">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/30" />
            <span>
              <span className="font-medium">{item.who}:</span> {item.task}
            </span>
          </li>
        ))}
      </ul>
    </OutcomeWindow>
  );
}
