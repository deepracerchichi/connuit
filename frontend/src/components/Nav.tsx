import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import gsap from "gsap";
import { X } from "lucide-react";
import { buttonClass } from "./Button";
import { isLoggedIn } from "../api/client";

const SECTION_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Use cases", href: "#what-you-can-build" },
];

const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = isLoggedIn();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Open: the panel wipes down from the top, then the links rise in. Close: quick fade.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (menuOpen) {
      document.documentElement.style.overflow = "hidden"; // no page scrolling behind the menu
      closeButtonRef.current?.focus();
      if (reduceMotion) {
        gsap.set(panel, { autoAlpha: 1, clipPath: "none" });
        return;
      }
      gsap
        .timeline()
        .set(panel, { autoAlpha: 1 })
        .fromTo(
          panel,
          { clipPath: "inset(0% 0% 100% 0% round 24px)" },
          { clipPath: "inset(0% 0% 0% 0% round 24px)", duration: 0.55, ease: "expo.out" },
        )
        .fromTo(
          panel.querySelectorAll(".js-menu-rise"),
          { autoAlpha: 0, y: 30 },
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" },
          "-=0.35",
        );
    } else {
      document.documentElement.style.overflow = "";
      gsap.to(panel, { autoAlpha: 0, duration: reduceMotion ? 0 : 0.25, ease: "power2.out" });
    }
  }, [menuOpen]);

  // Escape closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <>
      <nav className="js-nav fixed inset-x-5 top-5 z-50 md:p-6" aria-label="Main">
        {/* ---------- Desktop ---------- */}
        <div className="hidden items-center justify-between md:flex">
          <a href="/" onClick={(e) => { e.preventDefault(); scrollToTop(); }} className="relative rounded-md px-4 py-3">
            <div className="js-logo-pill absolute inset-0 rounded-md bg-gray-200 opacity-0" />
            <img src="/Logo.svg" alt="Conduit" className="relative h-8 w-auto" />
            <img src="/Logo-scroll.svg" alt="" aria-hidden="true" className="js-logo-scroll absolute left-4 top-3 h-8 w-auto opacity-0" />
          </a>

          <div className="flex items-center gap-1 rounded-md bg-gray-200 px-2 py-1 font-mono">
            {SECTION_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={buttonClass("secondary")}>
                {link.label}
              </a>
            ))}
            {loggedIn ? (
              <Link to="/dashboard" className={buttonClass("primary", "ml-3")}>Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className={buttonClass("secondary")}>Log in</Link>
                <Link to="/signup" className={buttonClass("primary", "ml-3")}>Get started</Link>
              </>
            )}
          </div>
        </div>

        {/* ---------- Mobile bar (IntegratedBio style) ---------- */}
        <div className="flex h-16 items-center justify-between rounded-2xl bg-white/85 py-2 pl-4 pr-2 backdrop-blur-md md:hidden">
          <a href="/" onClick={(e) => { e.preventDefault(); scrollToTop(); }}>
            <img src="/Logo-scroll.svg" alt="Conduit" className="h-7 w-auto" />
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Open menu"
            className="flex h-12 w-12 flex-col items-center justify-center gap-1.5 rounded-xl bg-ink"
          >
            <span className="h-px w-5 bg-accent" />
            <span className="h-px w-5 bg-accent" />
          </button>
        </div>
      </nav>

      {/* ---------- Mobile menu panel ----------
          Rendered outside <nav> on purpose: GSAP leaves a transform on .js-nav,
          and a transformed parent would trap this fixed panel inside the nav's box. */}
      <div
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!menuOpen}
        className="invisible fixed inset-2 z-60 flex flex-col overflow-hidden rounded-3xl bg-ink text-white opacity-0 md:hidden"
      >
        <MenuPattern />

        <div className="relative mx-3 mt-3 flex h-16 items-center justify-between rounded-2xl bg-white/10 py-2 pl-4 pr-2">
          <a href="/" onClick={(e) => { e.preventDefault(); close(); scrollToTop(); }}>
            <img src="/Logo.svg" alt="Conduit" className="h-7 w-auto" />
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <ul className="relative flex flex-1 flex-col items-center justify-center gap-1 text-center text-5xl tracking-tight">
          {SECTION_LINKS.map((link) => (
            <li key={link.href} className="js-menu-rise">
              <a href={link.href} onClick={close}>{link.label}</a>
            </li>
          ))}
          {loggedIn ? (
            <li className="js-menu-rise">
              <Link to="/dashboard" onClick={close} className="text-accent">Dashboard</Link>
            </li>
          ) : (
            <>
              <li className="js-menu-rise">
                <Link to="/login" onClick={close}>Log in</Link>
              </li>
              <li className="js-menu-rise">
                <Link to="/signup" onClick={close} className="text-accent">Get started</Link>
              </li>
            </>
          )}
        </ul>

        <div className="js-menu-rise relative pb-10 text-center">
          <a
            href="https://github.com/deepracerchichi/conduit"
            target="_blank"
            rel="noreferrer"
            className="border-b border-accent pb-1 text-lg"
          >
            github.com/deepracerchichi/conduit
          </a>
        </div>
      </div>
    </>
  );
}

// Faint outlines of big rounded shapes behind the menu links.
export function MenuPattern() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 860"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="white"
      strokeOpacity="0.09"
      strokeWidth="1"
    >
      <rect x="40" y="60" width="420" height="420" rx="90" transform="rotate(-32 250 270)" />
      <rect x="-160" y="300" width="380" height="380" rx="80" transform="rotate(38 30 490)" />
      <rect x="150" y="440" width="360" height="360" rx="80" transform="rotate(-28 330 620)" />
      <rect x="-120" y="640" width="320" height="320" rx="70" transform="rotate(30 40 800)" />
    </svg>
  );
}
