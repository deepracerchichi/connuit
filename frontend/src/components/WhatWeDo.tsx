import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const STATEMENTS = [
  "Conduit turns your tools into workflows that run on their own, triggered by a schedule, another app, or a single click.",
  "Every step can call an API or hand the decision to AI, so your workflows don't just move data, they make judgment calls.",
  "Runs survive failures with automatic retries and a full history of every step, so you always know what happened and why.",
];

const FADED_OPACITY = 0.4; // unlit characters
const SCROLL_PER_STATEMENT = 1000; // px of scrolling each statement gets while pinned
const LIGHT_UP_SPEED = 1.5; // text is fully lit at 1 / 1.5 = 2/3 of its scroll range
const SWITCH_GAP = 0.5; // seconds between the old statement leaving and the new one arriving

const pad = (n: number) => String(n).padStart(2, "0");

export default function WhatWeDo() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP((_context, contextSafe) => {
    let trigger: ScrollTrigger | undefined;
    let splits: SplitText[] = [];
    let pendingSwitch: gsap.core.Tween | undefined;
    let cancelled = false;

    const teardown = () => {
      pendingSwitch?.kill();
      trigger?.kill();
      splits.forEach((split) => split.revert());
      splits = [];
    };

    const build = contextSafe!(() => {
      const section = sectionRef.current;
      if (cancelled || !section) return;

      const bar = section.querySelector<HTMLElement>(".js-wwd-line");
      const counter = section.querySelector<HTMLElement>(".js-wwd-index");
      const items = gsap.utils.toArray<HTMLElement>(".js-wwd-text", section);
      if (!bar || !counter || items.length === 0) return;

      const total = items.length;
      splits = items.map((item) => SplitText.create(item, { type: "lines, chars", mask: "lines" }));

      gsap.set(bar, { scaleX: 0, transformOrigin: "left center" });
      gsap.set(items, { autoAlpha: 0 });
      gsap.set(items[0], { autoAlpha: 1 });
      splits.forEach((split) => gsap.set(split.chars, { opacity: FADED_OPACITY }));

      let active = 0;

      // Discrete event: a timed transition, so it always finishes cleanly
      // even if the user stops scrolling mid-way.
      const switchStatement = (from: number, to: number) => {
        pendingSwitch?.kill();
        items.forEach((item, i) => {
          if (i !== from && i !== to) gsap.set(item, { autoAlpha: 0 });
        });

        gsap.to(splits[from].lines, {
          autoAlpha: 0,
          y: -30,
          duration: 0.4,
          stagger: 0.05,
          ease: "power4.out",
          overwrite: true,
          onComplete: () => gsap.set(items[from], { autoAlpha: 0 }),
        });

        pendingSwitch = gsap.delayedCall(SWITCH_GAP, () => {
          gsap.set(items[to], { autoAlpha: 1 });
          gsap.fromTo(
            splits[to].lines,
            { autoAlpha: 0, y: 30 },
            { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power4.out", overwrite: true },
          );
        });
      };

      // Continuous state: recomputed from scroll position on every update,
      // so scrolling back up reverses it for free.
      const lightUp = (split: SplitText, amount: number) => {
        const exact = amount * split.chars.length;
        const lit = Math.floor(exact);
        split.chars.forEach((char, i) => {
          let opacity = FADED_OPACITY;
          if (i < lit) opacity = 1;
          else if (i === lit) opacity = FADED_OPACITY + (exact - lit) * (1 - FADED_OPACITY);
          gsap.set(char, { opacity });
        });
      };

      trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${total * SCROLL_PER_STATEMENT}`,
        pin: true,
        scrub: true,
        // This pin adds scroll space above everything after it. It's created
        // late (after fonts load), so make it recalculate first; otherwise
        // triggers further down measure their positions without that space.
        refreshPriority: 1,
        onUpdate: (self) => {
          const progress = self.progress;
          const index = Math.min(total - 1, Math.floor(progress * total));

          gsap.set(bar, { scaleX: progress });
          counter.textContent = pad(index + 1);

          if (index !== active) {
            switchStatement(active, index);
            active = index;
          }

          lightUp(splits[index], Math.min((progress * total - index) * LIGHT_UP_SPEED, 1));
        },
      });
    });

    // Line breaks depend on the real font, so wait for it before splitting.
    document.fonts.ready.then(() => {
      if (cancelled) return;
      build();
      // The pin adds scroll space, so every trigger further down the page
      // (created before this one) needs its start/end positions recalculated.
      ScrollTrigger.refresh();
    });

    // Line breaks change when the width changes: rebuild then, but ignore
    // height-only resizes (mobile address bar showing/hiding).
    let lastWidth = window.innerWidth;
    let resizeTimer: gsap.core.Tween | undefined;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      resizeTimer?.kill();
      resizeTimer = gsap.delayedCall(0.2, () => {
        teardown();
        build();
        ScrollTrigger.refresh();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      resizeTimer?.kill();
      teardown();
    };
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} className="relative z-10 min-h-screen pt-28 text-white md:pt-36">
      <div className="px-5 md:px-15">
        <div className="inline-flex items-center gap-3 rounded-md bg-white/10 px-3 py-2 font-mono text-sm uppercase backdrop-blur">
          <span className="h-3 w-3 bg-accent" />
          What we do
        </div>
      </div>

      <div className="relative mt-10 h-px md:mt-16 w-full bg-white/25">
        <div className="js-wwd-line absolute inset-0 origin-left bg-white" style={{ transform: "scaleX(0)" }} />
      </div>

      <div className="mt-10 grid gap-8 px-5 md:mt-14 md:gap-10 md:px-15 md:grid-cols-[1fr_2fr]">
        <div className="h-fit w-fit rounded-full border border-white/30 px-7 py-4 font-mono">
          <span className="js-wwd-index">01</span>
          <span className="text-white/40"> / {pad(STATEMENTS.length)}</span>
        </div>

        <div className="grid">
          {STATEMENTS.map((text, i) => (
            <p
              key={i}
              className={`js-wwd-text col-start-1 row-start-1 text-3xl leading-[1.1] tracking-tight md:text-6xl ${i === 0 ? "" : "opacity-0"}`}
            >
              {text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
