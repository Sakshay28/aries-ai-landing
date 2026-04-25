"use client";
import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import "./landing.css";
import {
  Navbar, ScrollProgress, PhaseDots,
  HeroScene, IncomingScene, AIScene,
  WorkflowScene, RevenueScene, CTAScene,
  FeaturesSection, HowItWorks, StatsBar, Footer,
} from "./components";

/* ═══ SCROLL HOOK ═══ */
function useScrollytelling() {
  const [progress, setProgress] = useState(0);
  const [inRange, setInRange] = useState(true);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const spacer = spacerRef.current;
      if (spacer) {
        const rect = spacer.getBoundingClientRect();
        const spacerHeight = spacer.offsetHeight;
        const scrolled = Math.max(0, -rect.top);
        const maxScroll = spacerHeight - window.innerHeight;
        const p = maxScroll > 0 ? Math.min(1, scrolled / maxScroll) : 0;
        setProgress(p);
        setInRange(rect.bottom > 0);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { progress, inRange, spacerRef };
}

/* ═══ SCENE OPACITY ═══ */
function getSceneOpacity(progress: number, sceneIndex: number): number {
  const count = 6;
  const w = 1 / count;
  const fade = w * 0.25;
  const start = sceneIndex * w;
  const end = start + w;
  if (sceneIndex === 0 && progress <= end - fade) return 1;
  if (sceneIndex === count - 1 && progress >= start + fade) return 1;
  if (progress < start || progress > end) return 0;
  if (progress < start + fade) return (progress - start) / fade;
  if (progress > end - fade) return (end - progress) / fade;
  return 1;
}

function getSceneProgress(progress: number, sceneIndex: number): number {
  const w = 1 / 6;
  const start = sceneIndex * w;
  const end = start + w;
  if (progress < start) return 0;
  if (progress > end) return 1;
  return (progress - start) / w;
}

export default function LandingPage() {
  const { progress, inRange, spacerRef } = useScrollytelling();

  const scenes = useMemo(() => ({
    hero:     { opacity: getSceneOpacity(progress, 0), progress: getSceneProgress(progress, 0) },
    incoming: { opacity: getSceneOpacity(progress, 1), progress: getSceneProgress(progress, 1) },
    ai:       { opacity: getSceneOpacity(progress, 2), progress: getSceneProgress(progress, 2) },
    workflow: { opacity: getSceneOpacity(progress, 3), progress: getSceneProgress(progress, 3) },
    revenue:  { opacity: getSceneOpacity(progress, 4), progress: getSceneProgress(progress, 4) },
    cta:      { opacity: getSceneOpacity(progress, 5), progress: getSceneProgress(progress, 5) },
  }), [progress]);

  const activePhase = Math.min(5, Math.floor(progress * 6));

  return (
    <div className="lp-root">
      <Navbar />
      <ScrollProgress progress={progress} />
      <PhaseDots activePhase={activePhase} />

      {inRange && (
        <div className="fixed-canvas">
          <HeroScene opacity={scenes.hero.opacity} />
          <IncomingScene opacity={scenes.incoming.opacity} progress={scenes.incoming.progress} />
          <AIScene opacity={scenes.ai.opacity} progress={scenes.ai.progress} />
          <WorkflowScene opacity={scenes.workflow.opacity} progress={scenes.workflow.progress} />
          <RevenueScene opacity={scenes.revenue.opacity} progress={scenes.revenue.progress} />
          <CTAScene opacity={scenes.cta.opacity} />
        </div>
      )}

      <div ref={spacerRef} className="scroll-spacer" style={{ height: "500vh" }} />

      {/* ── POST-SCROLL SECTIONS ── */}
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />

      {/* ── FINAL CTA ── */}
      <section className="final-cta" id="pricing">
        <h2>Ready to Automate Your Business?</h2>
        <p>Join hundreds of businesses already converting WhatsApp enquiries into revenue — automatically.</p>
        <a href="/signup" className="btn-white">Start Your Free Trial →</a>
        <p className="small">No credit card required · Cancel anytime</p>
      </section>

      <Footer />
    </div>
  );
}
