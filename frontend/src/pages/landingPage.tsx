import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Hero from "../components/Hero";
import WhatWeDo from "../components/WhatWeDo"
import HowItWorks from "../components/HowItWorks"
import WhatYouCanBuild from "../components/WhatYouCanBuild"

gsap.registerPlugin(ScrollTrigger);


export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Thinner frame on phones (matches inset-2 / rounded-2xl in Hero).
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    const inset = isDesktop ? 20 : 8;
    const radius = isDesktop ? 24 : 16;

    const tl = gsap.timeline();

  tl.fromTo(".js-hero-bg",
    { opacity: 0, top: "45%", bottom: "45%", left: "45%", right: "45%" },
    { opacity: 1, top: inset, bottom: inset, left: inset, right: inset, ease: "power2.out" }
  )
    .from(".js-nav", { opacity: 0, y: -20, duration: 0.6 })
    .from(".js-headline > span", { opacity: 0, y: 20, stagger: 0.15, duration: 0.6 }, "<")
    .from(".js-subtext-row > *", { opacity: 0, y: 20, stagger: 0.15, duration: 0.6 }, "<");


  const scrollTl = gsap.timeline({
  scrollTrigger: {
    trigger: ".js-hero",
    start: "top top",
    end: "+=150",
    scrub: true,
  },
});

scrollTl
  .fromTo(".js-hero-bg",
    { top: inset, bottom: inset, left: inset, right: inset, borderRadius: radius },
    { top: 0, bottom: 0, left: 0, right: 0, borderRadius: 0, ease: "none", immediateRender: false }
  )
  .to(".js-logo-scroll", { opacity: 1, ease: "none" }, 0)
  .to(".js-logo-pill", { opacity: 1, ease: "none" }, 0);

  }, { scope: containerRef });

  return (
    <div ref={containerRef}>
      <Hero />
      <WhatWeDo />
      <HowItWorks />
      <WhatYouCanBuild />
    </div>
  );
}

