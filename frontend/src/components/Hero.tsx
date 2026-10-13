import { useState, type Ref } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "./Button";
import { CtaButton } from "./CtaButton";

const NAV_LINKS = ["Company", "Newsroom"];

export default function Hero({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
    <div
      className="js-hero-bg fixed inset-2 z-0 overflow-hidden rounded-2xl bg-black md:inset-5 md:rounded-3xl"
    >
      <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover">
        <source src="/herobg2.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/40" />

    </div>

    <nav className="js-nav fixed inset-x-2 top-2 z-50 p-3 md:inset-x-5 md:top-5 md:p-6">
      <div className="flex items-center justify-between">
        <div className="relative rounded-md px-3 py-2 md:px-4 md:py-3">
          <div className="js-logo-pill absolute inset-0 rounded-md bg-gray-200 opacity-0" />
          <img src="/Logo.svg" alt="Conduit" className="relative h-6 w-auto md:h-8" />
          <img src="/Logo-scroll.svg" alt="" aria-hidden="true" className="js-logo-scroll absolute left-3 top-2 h-6 w-auto opacity-0 md:left-4 md:top-3 md:h-8" />
        </div>

        {/* Desktop links */}
        <div className="hidden items-center justify-between gap-4 rounded-md bg-gray-200 px-2 py-1 font-mono md:flex">
          {NAV_LINKS.map((link) => (
            <Button key={link} variant="secondary">{link}</Button>
          ))}
          <Button variant="primary">Work With Us</Button>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="flex items-center gap-2 rounded-md bg-gray-200 px-4 py-2.5 font-mono text-sm uppercase text-ink md:hidden"
        >
          {menuOpen ? "Close" : "Menu"}
          {menuOpen ? <X className="h-4 w-4" strokeWidth={1.75} /> : <Menu className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="mt-2 flex flex-col gap-1 rounded-md bg-gray-200 p-2 font-mono md:hidden">
          {NAV_LINKS.map((link) => (
            <Button key={link} variant="secondary" className="text-left" onClick={() => setMenuOpen(false)}>
              {link}
            </Button>
          ))}
          <Button variant="primary" className="text-left" onClick={() => setMenuOpen(false)}>
            Work With Us
          </Button>
        </div>
      )}
    </nav>

    <section ref={ref} className="js-hero relative z-10 flex min-h-svh flex-col justify-between px-2 pb-6 pt-28 md:block md:h-screen md:min-h-0 md:p-5 md:pt-32">

      <div className="js-headline relative z-20 p-4 text-5xl leading-[1.05] tracking-tight font-sans text-white md:p-10 md:text-8xl md:leading-none">
        <span className="block">Teach your workflows to</span>
        <span className="block">make decisions.</span>
      </div>

      <div className="js-subtext-row relative z-20 flex flex-col items-start gap-8 p-4 md:mt-40 md:mb-20 md:flex-row md:items-center md:justify-between md:p-10">
        <div>
          <p className="text-white text-lg text-wrap md:text-2xl">
            Connect any API, trigger on your schedule, and let AI handle the judgment calls.
          </p>
        </div>

        <div className="shrink-0">
          <CtaButton>DISCOVER US</CtaButton>
        </div>
      </div>
    </section>
    </>
  );
}
