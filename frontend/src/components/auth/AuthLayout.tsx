import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";

// Shared shell for the login and signup pages: video panel on one side, form on the other.
// Anything with the class "js-auth-rise" fades up in order when the page opens.
export function AuthLayout({
  tag,
  title,
  subtitle,
  headline,
  onSubmit,
  children,
}: {
  tag: string;
  title: string;
  subtitle: string;
  headline: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);

  // Page entrance: the video frame opens up, then the form rises in line by line.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap
        .timeline()
        .fromTo(
          ".js-auth-frame",
          { clipPath: "inset(50% 50% 50% 50% round 24px)" },
          { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 1.1, ease: "expo.inOut", clearProps: "clipPath" },
        )
        .from(".js-auth-rise", { autoAlpha: 0, y: 24, duration: 0.7, stagger: 0.07, ease: "power3.out" }, "-=0.5");
    });
    return () => mm.revert();
  }, { scope: pageRef });

  return (
    <div ref={pageRef} className="min-h-svh bg-paper text-ink lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ---------- Visual side ---------- */}
      <div className="p-2 lg:p-3">
        <div className="js-auth-frame relative h-56 overflow-hidden rounded-2xl bg-black lg:sticky lg:top-3 lg:h-[calc(100svh-1.5rem)] lg:rounded-3xl">
          <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover">
            <source src="/herobg2.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-black/30" />

          <Link to="/" className="absolute left-5 top-5 lg:left-8 lg:top-8">
            <img src="/Logo.svg" alt="Conduit" className="h-7 w-auto lg:h-8" />
          </Link>

          <div className="absolute inset-x-5 bottom-5 lg:inset-x-8 lg:bottom-8">
            <p className="hidden max-w-md text-5xl leading-[1.05] tracking-tight text-white lg:block">{headline}</p>
            <LiveRunCard />
          </div>
        </div>
      </div>

      {/* ---------- Form side ---------- */}
      <div className="flex items-center justify-center px-5 py-12 lg:px-16">
        <form onSubmit={onSubmit} className="w-full max-w-md">
          <span className="js-auth-rise inline-flex items-center gap-3 rounded-md bg-ink/5 px-3 py-2 font-mono text-sm uppercase">
            <span className="h-3 w-3 bg-accent ring-1 ring-ink/20" />
            {tag}
          </span>

          <h1 className="js-auth-rise mt-6 text-5xl tracking-tight md:text-6xl">{title}</h1>
          <p className="js-auth-rise mt-3 text-lg text-ink/60">{subtitle}</p>

          {children}

          <p className="js-auth-rise mt-12 flex items-center justify-center gap-2 font-mono text-xs text-ink/40">
            <Lock className="h-3 w-3" strokeWidth={2} />
            Your saved credentials are encrypted with AES-256-GCM
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---------- Error message that gives a short shake each time it changes ---------- */

export function ErrorBox({ message }: { message: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message || !boxRef.current) return;
    gsap.fromTo(boxRef.current, { x: -10 }, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.3)" });
  }, [message]);

  if (!message) return null;

  return (
    <div
      ref={boxRef}
      role="alert"
      className="mt-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      {message}
    </div>
  );
}

/* ---------- Input whose label floats up when focused or filled ---------- */

export function FloatingField({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  trailing,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="js-auth-rise relative">
      {/* placeholder=" " lets CSS tell empty from filled via :placeholder-shown */}
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        required
        className="peer h-16 w-full rounded-xl border border-ink/15 bg-white px-4 pb-2 pt-6 pr-12 text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-ink focus:ring-4 focus:ring-accent/60"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/50 transition-all duration-200 peer-focus:top-4 peer-focus:translate-y-0 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
      >
        {label}
      </label>
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}

/* ---------- Password field with a show/hide toggle ---------- */

export function PasswordField({
  autoComplete,
  value,
  onChange,
}: {
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);

  return (
    <FloatingField
      id="password"
      label="Password"
      type={shown ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={onChange}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="rounded-md p-2 text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {shown ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      }
    />
  );
}

/* ---------- Full-width submit button with the sliding arrow ---------- */

export function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="js-auth-rise group mt-6 flex h-14 w-full items-center justify-between rounded-xl bg-ink pl-6 pr-2 font-mono text-sm uppercase text-white transition-colors duration-300 hover:bg-accent hover:text-ink disabled:pointer-events-none disabled:opacity-70"
    >
      {loading ? loadingLabel : label}
      <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-accent text-ink transition-colors duration-300 group-hover:bg-ink group-hover:text-accent">
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
        ) : (
          <>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-10" strokeWidth={2} />
            <ArrowRight className="absolute h-4 w-4 -translate-x-10 transition-transform duration-300 group-hover:translate-x-0" strokeWidth={2} />
          </>
        )}
      </span>
    </button>
  );
}

/* ---------- "No account? / Already have one?" line under the button ---------- */

export function SwitchLink({ question, to, label }: { question: string; to: string; label: string }) {
  return (
    <p className="js-auth-rise mt-6 text-center text-ink/60">
      {question}{" "}
      <Link to={to} className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
        {label}
      </Link>
    </p>
  );
}

/* ---------- Frosted card on the video: a run ticking through its steps ---------- */

const RUN_STEPS = ["Fetch new posts", "Summarize with AI", "Post to Slack"];

function LiveRunCard() {
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const card = cardRef.current;
    if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rows = gsap.utils.toArray<HTMLElement>(".js-run-row", card);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 1.4 });

    tl.set(card.querySelectorAll(".js-run-spin, .js-run-ok"), { opacity: 0 }, 0)
      .set(card.querySelectorAll(".js-run-wait"), { opacity: 1 }, 0)
      .set(card.querySelector(".js-run-done"), { autoAlpha: 0 }, 0);

    rows.forEach((row) => {
      const spin = row.querySelector(".js-run-spin");
      tl.to(row.querySelector(".js-run-wait"), { opacity: 0, duration: 0.15 })
        .to(spin, { opacity: 1, duration: 0.15 }, "<")
        .fromTo(spin, { rotation: 0 }, { rotation: 360, duration: 0.8, ease: "none" }, "<")
        .to(spin, { opacity: 0, duration: 0.15 })
        .to(row.querySelector(".js-run-ok"), { opacity: 1, duration: 0.2 }, "<");
    });

    tl.to(card.querySelector(".js-run-done"), { autoAlpha: 1, duration: 0.3 }).to({}, { duration: 2 });
  }, { scope: cardRef });

  return (
    <div
      ref={cardRef}
      className="js-auth-rise mt-8 hidden max-w-sm rounded-2xl bg-white/10 p-5 text-white ring-1 ring-white/20 backdrop-blur-md lg:block"
    >
      <div className="flex items-center justify-between text-sm">
        <span>Morning briefing</span>
        <span className="js-run-done invisible rounded-full bg-accent px-2.5 py-0.5 text-xs text-ink">Succeeded</span>
      </div>
      <ul className="mt-4 flex flex-col gap-3 text-sm">
        {RUN_STEPS.map((step) => (
          <li key={step} className="js-run-row flex items-center gap-3">
            <span className="relative h-4 w-4 shrink-0">
              <span className="js-run-wait absolute inset-0.5 rounded-full border-[1.5px] border-white/40" />
              <LoaderCircle className="js-run-spin absolute inset-0 h-4 w-4 opacity-0" strokeWidth={2} />
              <CircleCheck className="js-run-ok absolute inset-0 h-4 w-4 text-accent opacity-0" strokeWidth={2} />
            </span>
            <span className="text-white/85">{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
