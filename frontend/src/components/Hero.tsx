import type { Ref } from "react";
import { CtaButton } from "./CtaButton";
import Nav from "./Nav";

export default function Hero({ ref }: { ref?: Ref<HTMLDivElement> }) {
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

    <Nav />

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
          <CtaButton href="/signup">Discover Us</CtaButton>
        </div>
      </div>
    </section>
    </>
  );
}
