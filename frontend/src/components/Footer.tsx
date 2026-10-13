import { useRef } from "react";
import { Link } from "react-router";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ArrowUp } from "lucide-react";
import { CtaButton } from "./CtaButton";

gsap.registerPlugin(ScrollTrigger, SplitText);

const NAVIGATE = [
  { label: "How it works", href: "#how-it-works" },
  { label: "What you can build", href: "#what-you-can-build" },
  { label: "Under the hood", href: "#under-the-hood" },
];

const linkClass = "text-xl tracking-tight text-white transition-opacity hover:opacity-60 md:text-lg";

// The footer has no background of its own: the fixed hero video behind the page
// shows through, and the section above ends in rounded corners so it reads as a
// card lifting off the video (IntegratedBio's footer).
export default function Footer() {
  const footerRef = useRef<HTMLElement>(null);

  useGSAP(() => {
    const footer = footerRef.current;
    const wordmark = footer?.querySelector<HTMLElement>(".js-footer-wordmark");
    if (!footer || !wordmark) return;
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      let split: SplitText | undefined;
      let cancelled = false;

      // Letters rise out of a mask once the wordmark comes into view.
      // Wait for the real font so the letters are measured at their final size.
      document.fonts.ready.then(() => {
        if (cancelled) return;
        split = SplitText.create(wordmark, { type: "chars", mask: "chars" });
        gsap.from(split.chars, {
          yPercent: 100,
          duration: 1,
          stagger: 0.05,
          ease: "expo.out",
          scrollTrigger: { trigger: wordmark, start: "top 95%", once: true },
        });
      });

      return () => {
        cancelled = true;
        split?.revert();
      };
    });

    return () => mm.revert();
  }, { scope: footerRef });

  return (
    <footer ref={footerRef} className="relative z-10 flex min-h-svh flex-col px-5 pb-5 pt-28 text-white md:px-12 md:pt-40">
      <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_auto] md:gap-0">
        <div className="md:pr-12">
          <p className="max-w-md text-4xl leading-[1.08] tracking-tight md:text-5xl">
            Teach your workflows to make decisions.
          </p>
          <div className="mt-10">
            <CtaButton href="/signup">Get started</CtaButton>
          </div>
        </div>

        <nav className="border-l border-white/30 pl-5" aria-label="Footer">
          <p className="font-mono text-sm uppercase">Navigate</p>
          <ul className="mt-5 flex flex-col gap-1.5">
            {NAVIGATE.map((item) => (
              <li key={item.href}>
                <a href={item.href} className={linkClass}>{item.label}</a>
              </li>
            ))}
            <li>
              <Link to="/login" className={linkClass}>Log in</Link>
            </li>
          </ul>
        </nav>

        <div className="flex items-start justify-between border-l border-white/30 pl-5 md:block">
          <div>
            <p className="font-mono text-sm uppercase">Connect</p>
            <ul className="mt-5 flex flex-col gap-1.5">
              <li>
                <a href="https://github.com/deepracerchichi/conduit" target="_blank" rel="noreferrer" className={linkClass}>
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <BackToTop className="flex md:hidden" />
        </div>

        <BackToTop className="hidden justify-self-end md:flex" />
      </div>

      <div className="mt-auto pt-24">
        <p className="text-right font-mono text-xs uppercase leading-relaxed md:text-left">
          © {new Date().getFullYear()} Conduit. Built by Chinyere Ukpong.
        </p>
        {/* Sized in vw so the word always spans the full width. */}
        <p
          aria-hidden="true"
          className="js-footer-wordmark mb-[-0.12em] mt-2 whitespace-nowrap text-[26.4vw] leading-[0.85] md:text-[27.8vw] tracking-[-0.04em]"
        >
          Conduit
        </p>
      </div>
    </footer>
  );
}

function BackToTop({ className }: { className: string }) {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/30 transition-colors hover:bg-white hover:text-ink ${className}`}
    >
      <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
