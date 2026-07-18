"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────────────────────────────
   BRAND                                                                     
───────────────────────────────────────────────────────────────────────── */
const G  = "#25D366";   // WhatsApp green — the ONE accent
const GD = "#128C7E";

/* ─────────────────────────────────────────────────────────────────────────
   EASING  (Emil Kowalski approved)                                          
───────────────────────────────────────────────────────────────────────── */
const EASE_OUT       = [0.23, 1, 0.32, 1] as const;   // strong expo-out
const EASE_IN_OUT    = [0.77, 0, 0.175, 1] as const;

/* ─────────────────────────────────────────────────────────────────────────
   SCROLL-REVEAL WRAPPER                                                     
   - starts at scale(0.96)+opacity 0 (never scale(0)) per Emil Kowalski     
   - 30-80 ms stagger between siblings                                       
───────────────────────────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  y = 16,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.55, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   GLOBAL CSS  (injected once — keeps the file self-contained)              
   No "transition: all", no border-left stripes, no glassmorphism           
───────────────────────────────────────────────────────────────────────── */
export const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; }
  html, body { max-width: 100%; overflow-x: hidden; }

  /* ─── Navbar ─── */
  .nav-inner { padding: 0 40px; height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .nav-links { display: flex; align-items: center; gap: 32px; }
  .nav-actions { display: flex; align-items: center; gap: 16px; }
  .nav-center-group { display: flex; align-items: center; gap: 48px; }
  .mobile-cta-inline { display: none; background: #25D366; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; flex-shrink: 0; height: 40px; align-items: center; }
  .hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; flex-direction: column; gap: 5px; }
  .hamburger span { display: block; width: 24px; height: 2px; background: #111; border-radius: 2px; transition: all 0.3s; }
  .mobile-menu { display: none; position: fixed; top: 68px; left: 0; right: 0; bottom: 0; background: #fff; z-index: 998; flex-direction: column; padding: 28px 24px; gap: 4px; overflow-y: auto; border-top: 1px solid #eee; }
  .mobile-menu.open { display: flex; }
  .mobile-nav-link { font-size: 17px; font-weight: 600; color: #222; text-decoration: none; padding: 14px 0; border-bottom: 1px solid #f3f3f3; display: block; }
  .mobile-nav-link:last-of-type { border-bottom: none; }
  .mobile-cta-group { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
  .mobile-cta-btn { display: block; text-align: center; padding: 15px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; background: #25D366; color: #fff; }
  .mobile-cta-btn.outline { background: #fff; color: #111; border: 1.5px solid #ddd; }

  /* ─── Hero ─── */
  .hero-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 60px; align-items: center; max-width: 1400px; margin: 0 auto; padding: 60px 40px; }
  .hero-cta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 40px; }
  .hero-image-wrap { display: flex; justify-content: center; position: relative; }

  /* ─── Section padding ─── */
  .section { padding: 96px 40px; }
  .section-sm { padding: 64px 40px; }
  .section-pad { padding: 64px 40px 100px; }
  .section-pad-sm { padding: 80px 40px; }

  /* ─── Grids ─── */
  .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  .industries-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; }
  .industries-grid:last-of-type { margin-bottom: 0; }
  .pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; max-width: 1280px; margin: 0 auto; }
  .trust-grid { display: grid; grid-template-columns: repeat(4, 1fr); max-width: 1280px; margin: 0 auto; width: 100%; }
  .setup-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 64px; align-items: center; max-width: 1300px; margin: 0 auto; }
  .hiw-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 40px; }

  /* ─── Button animations ─── */
  .btn-anim { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 4px 12px rgba(37,211,102,0.2) !important; }
  .btn-anim:hover { transform: translateY(-4px) scale(1.03) !important; box-shadow: 0 16px 40px rgba(37, 211, 102, 0.45) !important; }
  .btn-anim-outline { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; }
  .btn-anim-outline:hover { transform: translateY(-4px) scale(1.03) !important; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08) !important; border-color: #25D366 !important; color: #25D366 !important; }
  .btn-anim-white { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important; }
  .btn-anim-white:hover { transform: translateY(-4px) scale(1.03) !important; box-shadow: 0 20px 48px rgba(0, 0, 0, 0.25) !important; color: #128C7E !important; }

  /* ─── Pricing card ─── */
  .pc { background: #fff; color: #111; border: 1px solid #e8e8e8; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.03); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 24px; padding: 36px 28px 28px; position: relative; }
  .pc:hover { background: #0a0a0a; color: #fff; border-color: #0a0a0a; transform: scale(1.03) translateY(-4px); box-shadow: 0 32px 80px rgba(0,0,0,0.25); }
  .pc .pd { color: #999; transition: color 0.4s; }
  .pc:hover .pd { color: #bbb; }
  .pc .ps { color: #999; transition: color 0.4s; }
  .pc:hover .ps { color: #bbb; }
  .pc .po { color: #bbb; transition: color 0.4s; }
  .pc:hover .po { color: #666; }
  .pc .pb { background: #111; color: #fff; transition: all 0.4s; display: block; text-align: center; padding: 13px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; }
  .pc:hover .pb { background: #25D366; box-shadow: 0 4px 20px rgba(37,211,102,0.35); }
  .pc .pf { color: #666; transition: color 0.4s; }
  .pc:hover .pf { color: #ddd; }
  .pc .pf-highlight { color: #25D366; font-weight: 700; }
  .pc:hover .pf-highlight { color: #4ade80; }
  .pc .pop-badge { opacity: 1; transition: opacity 0.4s; }
  .pc:hover .pop-badge { opacity: 1; }
  .pc .sep { border-color: #f0f0f0; transition: border-color 0.4s; }
  .pc:hover .sep { border-color: #333; }
  .pc .cap-label { color: #555; transition: color 0.4s; font-weight: 600; font-size: 13px; }
  .pc:hover .cap-label { color: #ccc; }
  .pc .tmpl-section { background: #f8fafb; transition: background 0.4s; border-radius: 12px; padding: 16px; margin-top: 20px; }
  .pc:hover .tmpl-section { background: #1a1a1a; }
  .pc .tmpl-title { color: #128C7E; font-size: 12px; font-weight: 700; margin-bottom: 8px; transition: color 0.4s; }
  .pc:hover .tmpl-title { color: #4ade80; }
  .pc .tmpl-item { color: #666; font-size: 13px; transition: color 0.4s; display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .pc:hover .tmpl-item { color: #bbb; }
  .pc .voice-box { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; margin-top: 16px; transition: all 0.4s; }
  .pc:hover .voice-box { background: linear-gradient(135deg, #052e16, #064e3b); border-color: #065f46; }
  .pc .voice-title { color: #128C7E; font-size: 13px; font-weight: 800; margin-bottom: 6px; transition: color 0.4s; }
  .pc:hover .voice-title { color: #4ade80; }
  .pc .voice-detail { color: #555; font-size: 12px; padding: 2px 0; transition: color 0.4s; }
  .pc:hover .voice-detail { color: #a7f3d0; }

  /* ─── Billing toggle ─── */
  .t-switch { width: 44px; height: 24px; border-radius: 100px; background: #ddd; border: none; cursor: pointer; position: relative; transition: background 0.3s; padding: 0; }
  .t-switch.on { background: #25D366; }
  .t-thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  .t-switch.on .t-thumb { transform: translateX(20px); }
  .save-tag { display: inline-block; background: #dcfce7; color: #128C7E; font-size: 11px; font-weight: 700; border-radius: 100px; padding: 2px 8px; margin-left: 6px; }

  /* ─── Industry cards ─── */
  .uc-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .uc-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.10) !important; }

  /* ─── Tablet (≤1024px) ─── */
  @media (max-width: 1024px) {
    .pricing-grid { grid-template-columns: repeat(2, 1fr); }
    .trust-grid { grid-template-columns: repeat(2, 1fr); }
    .industries-grid { grid-template-columns: repeat(2, 1fr); }
    .hero-grid { grid-template-columns: 1fr; gap: 0; }
    .hero-image-wrap { display: none; }
    .setup-grid { grid-template-columns: 1fr; }
    .setup-image-col { display: none; }
  }

  /* ─── Mobile (≤768px) ─── */
  @media (max-width: 768px) {
    .nav-inner { padding: 0 16px; }
    .nav-links { display: none; }
    .nav-actions { display: none; }
    .nav-center-group { display: none; }
    .hamburger { display: flex; }
    .mobile-cta-inline { display: flex; }

    .hero-grid { padding: 72px 16px 40px; min-height: auto; }
    .hero-cta { flex-direction: column; }
    .hero-cta a, .hero-cta-outline { width: 100%; text-align: center; justify-content: center; }

    .section { padding: 64px 20px; }
    .section-sm { padding: 48px 20px; }
    .section-pad { padding: 48px 20px 64px; }
    .section-pad-sm { padding: 48px 20px; }

    .pricing-grid { grid-template-columns: 1fr; }
    .trust-grid { grid-template-columns: 1fr; }
    .industries-grid { grid-template-columns: 1fr; }
    .hiw-grid { grid-template-columns: 1fr; gap: 32px; }
    .step-connector { display: none !important; }

    .trust-items { flex-direction: column; align-items: center; gap: 20px; }

    .bold-stats { flex-direction: column; gap: 20px; }

    .cta-buttons { flex-direction: column; align-items: center; }
    .cta-buttons a { width: 100%; max-width: 360px; text-align: center; }

    .footer-inner { flex-direction: column; align-items: flex-start; gap: 20px; }
  }

  /* Define variables used by components */
  :root {
    --g:  #25D366;
    --gd: #128C7E;
    --mist: #f7f8fa;
    --ink3: #6b7280;
    --ease-out: cubic-bezier(0.23,1,0.32,1);
    --rule: rgba(0,0,0,0.07);
  }

  /* ─ Feature bento ────────────────────────────────────────────── */
  .feat-bento {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    grid-template-rows: repeat(3, auto);
    gap: 16px;
  }
  .feat-bento .f-wide { grid-column: 1; grid-row: 1 / 4; }
  .feat-bento .f-std  { }
  @media (max-width: 1024px) {
    .feat-bento { grid-template-columns: 1fr 1fr; }
    .feat-bento .f-wide { grid-column: span 2; grid-row: auto; }
  }
  @media (max-width: 640px) {
    .feat-bento { grid-template-columns: 1fr; }
    .feat-bento .f-wide { grid-column: 1; }
  }

  /* ─ Feature card ────────────────────────────────────────────── */
  .feat-card {
    background: var(--mist);
    border-radius: 20px;
    padding: 32px;
    border: 1px solid transparent;
    transition: border-color 200ms var(--ease-out),
                background 200ms var(--ease-out),
                transform 200ms var(--ease-out),
                box-shadow 200ms var(--ease-out);
    cursor: default;
  }
  .feat-card:hover {
    background: #fff;
    border-color: rgba(0,0,0,0.06);
    box-shadow: 0 4px 24px -4px rgba(0,0,0,0.10);
    transform: translateY(-2px);
  }
  .feat-icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 20px;
  }
  .feat-icon svg {
    width: 22px; height: 22px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
  }

  /* ─ Industry zig-zag ─────────────────────────────────────────── */
  .industry-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    align-items: center;
    padding: 40px 0;
    border-bottom: 1px solid var(--rule);
  }
  .industry-row:first-child { border-top: 1px solid var(--rule); }
  .industry-row.reverse .industry-text { order: 2; }
  .industry-row.reverse .industry-visual { order: 1; }
  @media (max-width: 768px) {
    .industry-row { grid-template-columns: 1fr; gap: 24px; }
    .industry-row.reverse .industry-text { order: 0; }
    .industry-row.reverse .industry-visual { order: 0; }
  }

  /* ─ Steps ─────────────────────────────────────────────────────── */
  .steps-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 48px;
  }
  @media (max-width: 768px) {
    .steps-grid { grid-template-columns: 1fr; gap: 32px; }
    .step-connector { display: none !important; }
  }

  /* ─ FAQ ──────────────────────────────────────────────────────── */
  .faq-question-text {
    transition: color 200ms var(--ease-out);
  }
  .faq-question-text:hover {
    color: var(--g) !important;
  }

  /* ─ Stats ────────────────────────────────────────────────────── */
  .stats-row {
    display: flex; justify-content: center;
    gap: 0;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 20px;
    overflow: hidden;
  }
  .stat-item {
    flex: 1; text-align: center; padding: 32px 24px;
    border-right: 1px solid rgba(0,0,0,0.08);
  }
  .stat-item:last-child { border-right: none; }
  @media (max-width: 640px) {
    .stats-row { flex-direction: column; }
    .stat-item { border-right: none; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .stat-item:last-child { border-bottom: none; }
  }

  /* ─ CTA section ─────────────────────────────────────────────── */
  .cta-section {
    background: linear-gradient(135deg, #0f1117 0%, #1a2235 100%);
    padding: 96px 40px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta-glow {
    position: absolute;
    width: 600px; height: 400px;
    background: radial-gradient(ellipse, rgba(37,211,102,0.12) 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%,-50%);
    pointer-events: none;
  }

  /* ─ Footer ───────────────────────────────────────────────────── */
  .footer-inner {
    max-width: 1280px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 20px;
  }
  @media (max-width: 768px) {
    .footer-inner { flex-direction: column; align-items: flex-start; }
    .cta-section { padding: 64px 24px; }
  }

  /* ─ Scrollbar ────────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }

  /* ─ Reduced motion ───────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* ─ Quickstart card ─────────────────────────────────────────── */
  .quickstart-card {
    background: #ffffff;
    border-radius: 32px;
    box-shadow: 0 20px 45px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.01);
    border: 1px solid rgba(0,0,0,0.06);
    padding: 48px 48px 48px 56px;
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 48px;
    align-items: center;
    overflow: hidden;
  }
  .quickstart-mockup {
    background: #ecfef3;
    border-radius: 24px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 420px;
    border: 1px solid rgba(37,211,102,0.15);
  }

  @media (max-width: 1024px) {
    .quickstart-card {
      grid-template-columns: 1fr;
      padding: 40px;
      gap: 36px;
    }
    .quickstart-mockup {
      min-height: 360px;
    }
  }

  @media (max-width: 768px) {
    .quickstart-card {
      padding: 32px 24px;
      gap: 28px;
      border-radius: 24px;
    }
    .quickstart-mockup {
      min-height: 280px;
      border-radius: 16px;
    }
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   SECTION LABEL — tasteful pill                                             
───────────────────────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11, fontWeight: 500,
      letterSpacing: "0.12em", textTransform: "uppercase",
      color: "#9ca3af",
      fontFamily: "'Geist Mono', monospace",
      marginBottom: 2,
    }}>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SVG ICONS  (no emojis per taste-skill)                                    
───────────────────────────────────────────────────────────────────────── */
function IconBrain() {
  return <svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>;
}
function IconMessage() {
  return <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function IconTrendUp() {
  return <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
}
function IconClock() {
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconSheet() {
  return <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}
function IconBell() {
  return <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IconArrow() {
  return <svg viewBox="0 0 24 24" width="16" height="16" style={{stroke:"currentColor",fill:"none",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
}
function IconCheck() {
  return <svg viewBox="0 0 24 24" width="14" height="14" style={{stroke:G,fill:"none",strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>;
}
function IconPhone() {
  return <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.44 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.22-1.22a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}

/* ─────────────────────────────────────────────────────────────────────────
   NAVBAR                                                                    
───────────────────────────────────────────────────────────────────────── */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    if (menuOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const navItems = ["Features", "Use Cases", "How It Works", "Pricing", "Contact Us"];

  return (
    <>
      <motion.nav
        initial={{ y: -72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
          background: scrolled ? "rgba(255,255,255,0.97)" : "#fff",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #eee",
          transition: "background 0.3s, border-bottom 0.3s",
        }}
      >
        <div className="nav-inner">
          <Link 
            href="/" 
            onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
                window.history.pushState("", document.title, window.location.pathname);
              }
            }}
            style={{ display: "flex", alignItems: "center", textDecoration: "none" }}
          >
            <img src="/logo.png" alt="Aries AI" style={{ height: 40 }} />
          </Link>

          {/* Desktop nav */}
          <div className="nav-center-group">
            <div className="nav-links">
              {navItems.map(item => (
                <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                  style={{ color: "#555", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
                  {item}
                </a>
              ))}
            </div>
            <div className="nav-actions">
              <motion.div whileTap={{ scale: 0.96 }}>
                <Link href="/login" className="btn-anim" style={{ display: "block", background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 80, textAlign: "center" }}>Login</Link>
              </motion.div>
              <motion.div whileTap={{ scale: 0.96 }}>
                <Link href="/signup" className="btn-anim" style={{ display: "block", background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 140, textAlign: "center" }}>Start Free Trial →</Link>
              </motion.div>
            </div>
          </div>

          {/* Mobile CTA — only visible on mobile, replaces Login+Trial in navbar */}
          <Link href="/signup" className="mobile-cta-inline btn-anim">Start Free Trial</Link>

          {/* Hamburger */}
          <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            <span style={{ transform: menuOpen ? "rotate(45deg) translate(5px, 5px)" : "none" }} />
            <span style={{ opacity: menuOpen ? 0 : 1 }} />
            <span style={{ transform: menuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none" }} />
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <div className={`mobile-menu${menuOpen ? " open" : ""}`}>
        {navItems.map(item => (
          <a key={item} className="mobile-nav-link"
            href={`#${item.toLowerCase().replace(/ /g, "-")}`}
            onClick={() => setMenuOpen(false)}>
            {item}
          </a>
        ))}
        <div className="mobile-cta-group">
          <Link href="/login" className="mobile-cta-btn outline" onClick={() => setMenuOpen(false)}>Login</Link>
          <Link href="/signup" className="mobile-cta-btn" onClick={() => setMenuOpen(false)}>Start Free Trial →</Link>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   HERO — left-aligned, asymmetric split (anti-center-bias per taste-skill) 
───────────────────────────────────────────────────────────────────────── */
const heroTextVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.75,
      delay: i * 0.12,
      ease: EASE_OUT,
    },
  }),
};

export function Hero() {
  return (
    <section style={{ minHeight: "100dvh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #f0fdf4 0%, #fff 50%, #f0fdf4 100%)", paddingTop: 80, overflow: "hidden" }}>
      <div className="hero-grid">
        <div>
          <motion.h1
            custom={0}
            initial="hidden"
            animate="visible"
            variants={heroTextVariants}
            style={{ fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-2px", marginBottom: 20 }}
          >
            Automate Your<br />
            <span style={{ color: G }}>WhatsApp Business</span><br />
            With AI
          </motion.h1>
          <motion.p
            custom={1}
            initial="hidden"
            animate="visible"
            variants={heroTextVariants}
            style={{ fontSize: 18, color: "#555", lineHeight: 1.7, marginBottom: 36, maxWidth: 480 }}
          >
            Your AI assistant replies to customer enquiries, takes bookings, captures leads, and follows up 24/7. While you sleep.
          </motion.p>
          <div className="hero-cta" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 40 }}>
            <motion.div
              custom={2}
              initial="hidden"
              animate="visible"
              variants={heroTextVariants}
            >
              <Link href="/signup" className="btn-anim" style={{ background: G, color: "#fff", padding: "16px 32px", borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
                Start Free 14-Day Trial →
              </Link>
            </motion.div>
            <motion.div
              custom={3}
              initial="hidden"
              animate="visible"
              variants={heroTextVariants}
            >
              <a href="#how-it-works" className="btn-anim-outline hero-cta-outline" style={{ background: "#fff", color: "#111", padding: "16px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid #ddd", textAlign: "center", display: "block" }}>
                See How It Works
              </a>
            </motion.div>
          </div>
          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={heroTextVariants}
            style={{ display: "flex", gap: 20, flexWrap: "wrap" }}
          >
            {["Free 14-day trial", "Pay with UPI later", "Setup in under 10 minutes"].map(t => (
              <span key={t} style={{ fontSize: 13, color: "#777", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, display: "inline-block", flexShrink: 0 }} />
                {t}
              </span>
            ))}
          </motion.div>
        </div>
        <div className="hero-image-wrap">
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
            style={{ width: "100%", height: "auto", display: "flex", justifyContent: "center" }}
          >
            <motion.img
              src="/page.png"
              alt="WhatsApp AI automation in action"
              initial={{ opacity: 0, scale: 1.2, x: 180 }}
              animate={{ opacity: 1, scale: 1.3, x: 100 }}
              transition={{ duration: 1.2, delay: 0.35, ease: EASE_OUT }}
              style={{
                width: "100%", maxWidth: 960,
                transformOrigin: "center right",
                height: "auto", position: "relative", zIndex: 1,
                WebkitMaskImage: "radial-gradient(ellipse 80% 80% at center, black 50%, transparent 100%)",
                maskImage: "radial-gradient(ellipse 80% 80% at center, black 50%, transparent 100%)",
              }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TRUST BAR — dark strip with grid layout                                   
───────────────────────────────────────────────────────────────────────── */
export function TrustBar() {
  const items = [
    {
      icon: (
        <svg viewBox="0 0 24 24" width="26" height="26" style={{stroke:"#4ade80",fill:"none",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      title: "Official Meta API",
      desc: "Direct WhatsApp Cloud API",
      tag: "Verified",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" width="26" height="26" style={{stroke:"#4ade80",fill:"none",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      ),
      title: "Built in India",
      desc: "Designed for Indian businesses",
      tag: "India",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" width="26" height="26" style={{stroke:"#4ade80",fill:"none",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
      title: "Bank-Grade Security",
      desc: "AES-256 + row-level isolation",
      tag: "Encrypted",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" width="26" height="26" style={{stroke:"#4ade80",fill:"none",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"}}>
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
      title: "14-Day Free Trial",
      desc: "No credit card required",
      tag: "Free",
    },
  ];

  return (
    <section style={{
      background: "#0c0e14",
      borderTopLeftRadius: "50% 30px",
      borderTopRightRadius: "50% 30px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      marginTop: "-30px",
      position: "relative",
      zIndex: 10,
      paddingTop: 10,
      overflow: "hidden"
    }}>
      <div className="trust-grid" style={{ padding: "0 40px" }}>
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.09, ease: EASE_OUT }}
            whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
            style={{
              padding: "40px 32px",
              borderRight: i < 3 ? "1px solid rgba(255,255,255,0.05)" : "none",
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              gap: 0, cursor: "default",
              transition: "background 200ms",
            }}
          >
            {/* Icon with glow ring */}
            <motion.div
              whileHover={{ scale: 1.08 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              style={{
                width: 52, height: 52,
                borderRadius: 14,
                background: "rgba(74,222,128,0.08)",
                border: "1px solid rgba(74,222,128,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 20,
                position: "relative",
              }}
            >
              {item.icon}
              {/* subtle pulsing glow */}
              <motion.div
                animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.15, 1] }}
                transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.4 }}
                style={{
                  position: "absolute", inset: -4,
                  borderRadius: 18,
                  background: "rgba(74,222,128,0.08)",
                  pointerEvents: "none",
                }}
              />
            </motion.div>

            {/* Tag pill */}
            <div style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "#4ade80",
              marginBottom: 8,
            }}>{item.tag}</div>

            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: "-0.3px" }}>
              {item.title}
            </div>
            <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
              {item.desc}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   STATS — numbers with borders instead of cards (Impeccable flat rule)     
───────────────────────────────────────────────────────────────────────── */
export function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  const stats = [
    { n: "3 min", label: "Average setup time" },
    { n: "24/7", label: "Always on, never sleeps" },
    { n: "11+", label: "Indian languages" },
    { n: "94%", label: "CSAT on day one" },
  ];

  return (
    <section className="section" style={{
      background: "#0c0e14",
      color: "#fff",
      borderBottomLeftRadius: "50% 30px",
      borderBottomRightRadius: "50% 30px",
      paddingBottom: 80,
      position: "relative",
      zIndex: 10
    }}>
      <div className="container">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{
              fontSize: "clamp(34px,4vw,56px)",
              fontWeight: 900, letterSpacing: "-2px",
              marginTop: 16, marginBottom: 16,
              lineHeight: 1.1,
            }}>
              The AI that knows your business<br />
              <span style={{ color: "#a1a1aa", fontWeight: 700 }}>better than your staff.</span>
            </h2>
            <p style={{ fontSize: 19, color: "#9ca3af", maxWidth: 680, margin: "0 auto", lineHeight: 1.7 }}>
              Every business is unique. Aries AI learns your menu, prices, FAQs, and tone, then answers like a trained team member.
            </p>
          </div>
        </Reveal>
        
        <div ref={ref} className="stats-row">
          {stats.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.55, delay: i * 0.1, ease: EASE_OUT }}
              className="stat-item"
            >
              <div style={{
                fontSize: "clamp(32px,3.5vw,52px)",
                fontWeight: 900, color: G,
                letterSpacing: "-1.5px", lineHeight: 1,
                marginBottom: 8,
                fontFamily: "'Geist Mono', monospace",
              }}>
                <AnimatedCounter value={s.n} trigger={inView} />
              </div>
              <div style={{ fontSize: 13, color: "#999", fontWeight: 500 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FEATURES — asymmetric bento grid (anti-3-column rule)                     
───────────────────────────────────────────────────────────────────────── */
/* Animated typing indicator for the chat bubble */
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", padding: "6px 10px" }}>
      {[0, 1, 2].map(i => (
        <motion.div key={i}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "#aaa" }}
        />
      ))}
    </div>
  );
}

/* Mini lead score pill */
function LeadPill({ label, score, color }: { label: string; score: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px",
      background: "#fff", borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.07)",
      marginBottom: 5,
    }}>
      <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, color,
        background: `${color}18`, borderRadius: 5, padding: "2px 7px",
        fontFamily: "'Geist Mono', monospace",
      }}>{score}</span>
    </div>
  );
}

function WhatsAppApiVisual({ color, isHovered }: { color: string; isHovered?: boolean }) {
  return (
    <motion.div 
      animate={{
        scale: isHovered ? 1.02 : 1,
        borderColor: isHovered ? `${color}35` : "rgba(0,0,0,0.05)",
      }}
      style={{ 
        marginTop: 14, display: "flex", alignItems: "center", gap: 8,
        background: "rgba(37,211,102,0.07)", borderRadius: 10, padding: "10px 12px",
        border: "1px solid transparent",
        transition: "border-color 0.3s"
      }}
    >
      <motion.div 
        animate={isHovered ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 28, height: 28, borderRadius: "50%", background: color,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#fff", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}><polyline points="20 6 9 17 4 12"/></svg>
      </motion.div>
      <span style={{ fontSize: 11.5, color: "#444", fontWeight: 500 }}>Meta Verified · Active</span>
      <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 7, height: 7, borderRadius: "50%", background: color, marginLeft: "auto", flexShrink: 0 }} />
    </motion.div>
  );
}

function LeadPipelineVisual({ isHovered }: { isHovered?: boolean }) {
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
      {[
        { label: "Rahul: Table booking", score: "HOT", color: "#ef4444", delay: 0 },
        { label: "Priya: Menu inquiry", score: "WARM", color: "#f59e0b", delay: 0.15 },
        { label: "Ankit: Just browsing", score: "COLD", color: "#6b7280", delay: 0.3 },
      ].map((item, idx) => (
        <motion.div 
          key={idx}
          animate={{
            scale: isHovered ? 1.02 : 1,
            x: isHovered ? 4 : 0,
            borderColor: isHovered && item.score === "HOT" ? `${item.color}45` : "rgba(0,0,0,0.07)",
          }}
          transition={{ duration: 0.25, delay: idx * 0.05 }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px",
            background: "#fff", borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>{item.label}</span>
          <motion.span 
            animate={{
              scale: isHovered && item.score === "HOT" ? [1, 1.1, 1] : 1,
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: item.delay }}
            style={{
              fontSize: 11, fontWeight: 700, color: item.color,
              background: `${item.color}18`, borderRadius: 5, padding: "2px 7px",
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            {item.score}
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function FollowUpsVisual({ isHovered }: { isHovered?: boolean }) {
  const items2 = [["30 min", "First reminder"], ["3 hrs", "Soft nudge"], ["24 hrs", "Final follow-up"]];
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
      {items2.map((item, j) => (
        <motion.div 
          key={j} 
          animate={{
            x: isHovered ? 6 : 0,
          }}
          transition={{ duration: 0.25, delay: j * 0.05 }}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <motion.div 
            animate={{
              scale: isHovered ? [1, 1.35, 1] : 1,
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: j * 0.2 }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#EC4899", flexShrink: 0 }} 
          />
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "#EC4899", fontWeight: 600, minWidth: 34 }}>{item[0]}</span>
          <span style={{ fontSize: 11.5, color: "#888" }}>{item[1]}</span>
        </motion.div>
      ))}
    </div>
  );
}

function SheetsSyncVisual({ isHovered }: { isHovered?: boolean }) {
  const cells = ["Name", "Phone", "Status", "Rahul S.", "98765...", "✓ Sent", "Priya M.", "87654...", "⏳ Pending"];
  return (
    <motion.div 
      animate={{
        borderColor: isHovered ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.15)",
        scale: isHovered ? 1.02 : 1,
      }}
      style={{ marginTop: 14, background: "rgba(16,185,129,0.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(16,185,129,0.15)", transition: "border-color 0.3s" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
        {cells.map((cell, ci) => (
          <motion.div 
            key={ci} 
            animate={{
              background: isHovered && ci >= 3 && ci < 6 ? "rgba(16,185,129,0.1)" : ci < 3 ? "rgba(16,185,129,0.15)" : "transparent",
            }}
            transition={{ duration: 0.3 }}
            style={{
              fontSize: ci < 3 ? 9 : 10.5, padding: "3px 5px",
              background: ci < 3 ? "rgba(16,185,129,0.15)" : "transparent",
              color: ci < 3 ? "#10B981" : "#555",
              fontWeight: ci < 3 ? 700 : 400,
              fontFamily: "'Geist Mono', monospace",
              borderRadius: 3,
            }}
          >
            {cell === "⏳ Pending" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <svg viewBox="0 0 24 24" width="10" height="10" style={{ stroke: "#f59e0b", fill: "none", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}>
                  <path d="M5 2h14M5 22h14M19 2v4c0 3-2 5-5 7 3 2 5 4 5 7v4M5 2v4c0 3 2 5 5 7-3 2-5 4-5 7v4" />
                </svg>
                Pending
              </span>
            ) : cell}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function AlertsVisual({ isHovered }: { isHovered?: boolean }) {
  return (
    <motion.div
      animate={{ 
        y: isHovered ? [0, -4, 0] : [0, -2, 0],
        scale: isHovered ? 1.02 : 1,
        borderColor: isHovered ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.12)",
        boxShadow: isHovered ? "0 8px 24px rgba(59,130,246,0.2)" : "0 4px 16px rgba(59,130,246,0.15)",
      }}
      transition={{ 
        y: { duration: isHovered ? 1.5 : 2, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 0.3 },
        borderColor: { duration: 0.3 },
        boxShadow: { duration: 0.3 }
      }}
      style={{
        marginTop: 14, background: "#fff",
        borderRadius: 12, padding: "10px 12px",
        boxShadow: "0 4px 16px rgba(59,130,246,0.15)",
        border: "1px solid rgba(59,130,246,0.12)",
        display: "flex", gap: 10, alignItems: "flex-start",
      }}
    >
      <motion.div 
        animate={{
          rotate: isHovered ? [0, -12, 12, -12, 12, 0] : 0,
        }}
        transition={{ duration: 0.6, repeat: isHovered ? Infinity : 0, repeatDelay: 1 }}
        style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#25D366,#128C7E)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ stroke: "#fff", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </motion.div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#111", marginBottom: 2 }}>New HOT Lead!</div>
        <div style={{ fontSize: 11, color: "#888" }}>Rahul wants a table for 7PM · Respond now</div>
      </div>
    </motion.div>
  );
}

function IconCreditCard() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function RazorpayVisual({ isHovered }: { isHovered?: boolean }) {
  return (
    <motion.div
      animate={{ 
        y: isHovered ? [0, -4, 0] : [0, -2, 0],
        scale: isHovered ? 1.02 : 1,
        borderColor: isHovered ? "rgba(51,149,255,0.3)" : "rgba(51,149,255,0.12)",
        boxShadow: isHovered ? "0 8px 24px rgba(51,149,255,0.2)" : "0 4px 16px rgba(51,149,255,0.12)",
      }}
      transition={{ 
        y: { duration: isHovered ? 1.5 : 2, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 0.3 },
        borderColor: { duration: 0.3 },
        boxShadow: { duration: 0.3 }
      }}
      style={{
        marginTop: 14, background: "#fff",
        borderRadius: 12, padding: "10px 12px",
        boxShadow: "0 4px 16px rgba(51,149,255,0.12)",
        border: "1px solid rgba(51,149,255,0.12)",
        display: "flex", gap: 10, alignItems: "center",
      }}
    >
      <motion.div 
        animate={{
          scale: isHovered ? [1, 1.1, 1] : 1,
        }}
        transition={{ duration: 1.5, repeat: isHovered ? Infinity : 0 }}
        style={{ 
          width: 32, height: 32, borderRadius: "50%", 
          background: "linear-gradient(135deg,#3395FF,#0052FF)",
          display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center",
          flexShrink: 0 
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ stroke: "#fff", fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </motion.div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#111" }}>Payment Received!</div>
          <div style={{ 
            fontSize: 10, fontWeight: 700, color: "#10B981", 
            background: "rgba(16,185,129,0.1)", borderRadius: 5, padding: "1px 6px",
            fontFamily: "'Geist Mono', monospace"
          }}>PAID</div>
        </div>
        <div style={{ fontSize: 10.5, color: "#888", display: "flex", justifyContent: "space-between" }}>
          <span>Rahul Sharma · Deposit</span>
          <span style={{ fontWeight: 600, color: "#111" }}>₹500.00</span>
        </div>
      </div>
    </motion.div>
  );
}

function ChatWindow({ 
  avatarColor, 
  name, 
  status, 
  messages, 
  activeMsg, 
  isWideHovered 
}: { 
  avatarColor: string; 
  name: string; 
  status: string; 
  messages: { role: string; text: string }[]; 
  activeMsg: number; 
  isWideHovered: boolean; 
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 14, padding: "14px 14px 10px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      display: "flex",
      flexDirection: "column",
      flex: 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#fff", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{name}</div>
          <motion.div 
            animate={isWideHovered ? { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontSize: 10, color: "#25D366", fontWeight: 500 }}
          >
            ● {status}
          </motion.div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 180, justifyContent: "flex-start" }}>
        {messages.slice(0, activeMsg + 1).map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}
          >
            <div style={{
              background: m.role === "user" ? G : "#f0f0f0",
              color: m.role === "user" ? "#fff" : "#222",
              padding: "7px 12px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              fontSize: 12.5, lineHeight: 1.5, maxWidth: "85%",
            }}>{m.text}</div>
          </motion.div>
        ))}
        {activeMsg < messages.length - 1 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: "flex", justifyContent: "flex-start" }}
          >
            <div style={{ background: "#f0f0f0", borderRadius: "12px 12px 12px 3px", padding: "6px 12px" }}>
              <TypingDots />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function Features() {
  const [activeMsg, setActiveMsg] = useState(0);
  const [hoveredBentoIndex, setHoveredBentoIndex] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setActiveMsg(p => (p + 1) % 4), 2200);
    return () => clearInterval(t);
  }, []);

  const hinglishMsgs = [
    { role: "user", text: "Bhai kal 7 baje table milegi?" },
    { role: "ai",   text: "Haan bilkul! Kal 7:00 PM pe table free hai. Kitne log honge?" },
    { role: "user", text: "4 log hain bro, confirm kar do." },
    { role: "ai",   text: "Done! 4 logon ke liye table reserve ho gayi hai. See you tomorrow!" },
  ];

  const englishMsgs = [
    { role: "user", text: "Hi! Do you have a table free tomorrow at 7 PM?" },
    { role: "ai",   text: "Hello! Yes, we have a table available at 7:00 PM tomorrow. For how many guests?" },
    { role: "user", text: "It will be for 4 people, please confirm." },
    { role: "ai",   text: "Perfect! Your table for 4 is confirmed for tomorrow at 7:00 PM. See you!" },
  ];

  const smallCards = [
    {
      icon: <IconMessage />, color: G,
      title: "Direct WhatsApp API",
      desc: "Official Meta Cloud API. Your number, your data.",
      VisualComponent: WhatsAppApiVisual,
    },
    {
      icon: <IconTrendUp />, color: "#F59E0B",
      title: "Smart Lead Pipeline",
      desc: "Every chat automatically scored: hot, warm, cold.",
      VisualComponent: LeadPipelineVisual,
    },
    {
      icon: <IconClock />, color: "#EC4899",
      title: "Auto Follow-Ups",
      desc: "30 min, 3 hours, 24 hours. All configurable.",
      VisualComponent: FollowUpsVisual,
    },
    {
      icon: <IconSheet />, color: "#10B981",
      title: "Google Sheets Sync",
      desc: "Every lead in a Sheet instantly. Share with your team.",
      VisualComponent: SheetsSyncVisual,
    },
    {
      icon: <IconBell />, color: "#3B82F6",
      title: "Instant Staff Alerts",
      desc: "Hot lead? Staff pinged on WhatsApp immediately.",
      VisualComponent: AlertsVisual,
    },
    {
      icon: <IconCreditCard />, color: "#3395FF",
      title: "Razorpay Payments",
      desc: "Generate payment links and collect booking deposits instantly.",
      VisualComponent: RazorpayVisual,
    },
  ];

  const isWideHovered = hoveredBentoIndex === 0;
  const isOtherBentoHovered = hoveredBentoIndex !== null && hoveredBentoIndex !== 0;

  return (
    <section id="features" className="section" style={{ background: "#f7f8fa", scrollMarginTop: 68 }}>
      <div className="container">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{
              fontSize: "clamp(34px,4vw,56px)",
              fontWeight: 900, letterSpacing: "-2px",
              marginTop: 16,
              lineHeight: 1.1,
            }}>
              Everything to <span style={{ color: G }}>close more leads</span>
            </h2>
            <p style={{ color: "#374151", fontSize: 19, marginTop: 16, maxWidth: 640, margin: "16px auto 0", lineHeight: 1.7, fontWeight: 500 }}>
              Built for restaurants, salons, clinics, and any business getting WhatsApp enquiries.
            </p>
          </div>
        </Reveal>

        {/* BENTO: asymmetric 2fr 1fr 1fr */}
        <div className="feat-bento">

          {/* WIDE CARD — AI chat demo */}
          <Reveal className="f-wide">
            <motion.div
              className="feat-card"
              onMouseEnter={() => setHoveredBentoIndex(0)}
              onMouseLeave={() => setHoveredBentoIndex(null)}
              animate={{
                scale: isWideHovered ? 1.04 : isOtherBentoHovered ? 0.96 : 1,
                y: isWideHovered ? -8 : 0,
                opacity: isOtherBentoHovered ? 0.45 : 1,
                filter: isOtherBentoHovered ? "blur(1.5px)" : "blur(0px)"
              }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              style={{ 
                height: "100%",
                border: isWideHovered ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(0,0,0,0.06)",
                boxShadow: isWideHovered 
                  ? "0 20px 40px rgba(139,92,246,0.12), 0 0 20px rgba(139,92,246,0.06)"
                  : "0 2px 12px rgba(0,0,0,0.04)",
                cursor: "pointer",
                transition: "border 0.3s, box-shadow 0.3s",
                position: "relative",
                overflow: "visible",
              }}
            >
              {/* Spotlight shine overlay */}
              {isWideHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "radial-gradient(circle at 50% 0%, rgba(139,92,246,0.05) 0%, transparent 70%)",
                    pointerEvents: "none",
                    borderRadius: 20,
                    zIndex: 0,
                  }}
                />
              )}
              {/* Content */}
              <div style={{ position: "relative", zIndex: 1 }}>
                <div className="feat-icon" style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>
                  <IconBrain />
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, letterSpacing: "-0.4px" }}>
                  AI That Truly Understands
                </h3>
                <p style={{ fontSize: 14, color: "#777", lineHeight: 1.7, marginBottom: 20 }}>
                  Not a rigid chatbot. Real language understanding that gets &apos;bhai kal 4 baje table milega?&apos; in Hindi, English, or Hinglish. Trains on your business once and handles everything 24/7.
                </p>

                {/* Dual live animated chats */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}>
                  <ChatWindow 
                    avatarColor="linear-gradient(135deg,#25D366,#128C7E)"
                    name="Aries AI · Your Business"
                    status="Online"
                    messages={hinglishMsgs}
                    activeMsg={activeMsg}
                    isWideHovered={isWideHovered}
                  />
                  <ChatWindow 
                    avatarColor="linear-gradient(135deg,#3B82F6,#1D4ED8)"
                    name="Aries AI · Your Business"
                    status="Online"
                    messages={englishMsgs}
                    activeMsg={activeMsg}
                    isWideHovered={isWideHovered}
                  />
                </div>
              </div>
            </motion.div>
          </Reveal>

          {/* SMALL CARDS */}
          {smallCards.map((f, i) => {
            const cardIdx = i + 1;
            const isHovered = hoveredBentoIndex === cardIdx;
            const isOtherBentoHovered = hoveredBentoIndex !== null && hoveredBentoIndex !== cardIdx;
            return (
              <Reveal key={f.title} delay={0.07 + i * 0.06} className="f-std">
                <motion.div
                  className="feat-card"
                  onMouseEnter={() => setHoveredBentoIndex(cardIdx)}
                  onMouseLeave={() => setHoveredBentoIndex(null)}
                  animate={{
                    scale: isHovered ? 1.04 : isOtherBentoHovered ? 0.96 : 1,
                    y: isHovered ? -8 : 0,
                    opacity: isOtherBentoHovered ? 0.45 : 1,
                    filter: isOtherBentoHovered ? "blur(1.5px)" : "blur(0px)"
                  }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  style={{ 
                    height: "100%",
                    border: isHovered ? `1px solid ${f.color}40` : "1px solid rgba(0,0,0,0.06)",
                    boxShadow: isHovered 
                      ? `0 20px 40px ${f.color}12, 0 0 24px ${f.color}06`
                      : "0 2px 12px rgba(0,0,0,0.04)",
                    cursor: "pointer",
                    transition: "border 0.3s, box-shadow 0.3s",
                    position: "relative",
                    overflow: "visible",
                  }}
                >
                  {/* Spotlight shine overlay */}
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: `radial-gradient(circle at 50% 0%, ${f.color}06 0%, transparent 70%)`,
                        pointerEvents: "none",
                        borderRadius: 20,
                        zIndex: 0,
                      }}
                    />
                  )}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div className="feat-icon" style={{ background: `${f.color}14`, color: f.color }}>
                      {f.icon}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 7, letterSpacing: "-0.3px" }}>
                      {f.title}
                    </h3>
                    <p style={{ fontSize: 13, color: "#777", lineHeight: 1.65, margin: 0 }}>
                      {f.desc}
                    </p>
                    <f.VisualComponent isHovered={isHovered} color={f.color} />
                  </div>
                </motion.div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}



/* ─────────────────────────────────────────────────────────────────────────
   USE CASES — zig-zag rows (anti-3-column-identical-grid)                   
───────────────────────────────────────────────────────────────────────── */
/* Industry visual mockups — replace the blank coloured square */


function EcommerceVisual({ color, isHovered }: { color: string; isHovered?: boolean }) {
  const items = ["Cart Reminder", "Order Shipped", "COD Confirm"];
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((label, i) => (
        <motion.div key={label}
          initial={{ opacity: 0, x: 12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.12, duration: 0.4, ease: EASE_OUT }}
          animate={{
            scale: isHovered ? 1.03 : 1,
            x: isHovered ? 6 : 0,
            borderColor: isHovered ? `${color}35` : "rgba(0,0,0,0.06)",
            boxShadow: isHovered ? `0 4px 12px ${color}0d` : "0 1px 6px rgba(0,0,0,0.06)",
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff", borderRadius: 10,
            padding: "10px 14px",
            border: "1px solid rgba(0,0,0,0.06)",
            transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#333", flex: 1 }}>{label}</span>
          <motion.span 
            animate={{
              scale: isHovered ? [1, 1.1, 1] : 1,
            }}
            transition={{
              duration: 1.2,
              repeat: isHovered ? Infinity : 0,
              ease: "easeInOut",
              delay: i * 0.2
            }}
            style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: color, fontWeight: 700,
              background: `${color}12`, borderRadius: 4, padding: "2px 6px" }}
          >
            Sent ✓
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function HealthVisual({ color, isHovered }: { color: string; isHovered?: boolean }) {
  const slots = [
    { time: "10:00 AM", name: "Dr. Priya", free: false },
    { time: "11:30 AM", name: "Available", free: true },
    { time: "2:00 PM",  name: "Dr. Mehta", free: false },
    { time: "3:30 PM",  name: "Available", free: true },
  ];
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "#999", marginBottom: 8, letterSpacing: "0.06em" }}>TODAY&apos;S SLOTS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map((s, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.4, ease: EASE_OUT }}
            animate={{
              scale: isHovered && s.free ? 1.03 : 1,
              x: isHovered && s.free ? 6 : 0,
              borderColor: isHovered && s.free ? `${color}45` : s.free ? `${color}25` : "rgba(0,0,0,0.06)",
              boxShadow: isHovered && s.free ? `0 4px 12px ${color}0d` : "none",
            }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              background: s.free ? `${color}0d` : "rgba(0,0,0,0.03)",
              border: `1px solid ${s.free ? `${color}25` : "rgba(0,0,0,0.06)"}`,
              transition: "border-color 0.3s ease, box-shadow 0.3s ease",
            }}
          >
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10.5, color: "#888", minWidth: 60 }}>{s.time}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: s.free ? color : "#555", flex: 1 }}>{s.name}</span>
            {s.free && (
              <motion.span 
                animate={{
                  scale: isHovered ? [1, 1.15, 1] : 1,
                }}
                transition={{
                  duration: 1.5,
                  repeat: isHovered ? Infinity : 0,
                  ease: "easeInOut",
                  delay: i * 0.25
                }}
                style={{ fontSize: 10, fontWeight: 700, color, background: `${color}15`, borderRadius: 4, padding: "2px 6px" }}
              >
                Book
              </motion.span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function RealEstateVisual({ color, isHovered }: { color: string; isHovered?: boolean }) {
  const leads = [
    { name: "Amit K.", query: "3 BHK · Bandra", score: 92, hot: true },
    { name: "Sunita R.", query: "2 BHK · Andheri", score: 74, hot: false },
    { name: "Deepak M.", query: "Villa · Juhu", score: 88, hot: true },
  ];
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
      {leads.map((l, i) => (
        <motion.div key={l.name}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 + i * 0.1, duration: 0.4, ease: EASE_OUT }}
          animate={{
            scale: isHovered ? 1.03 : 1,
            x: isHovered ? 6 : 0,
            borderColor: isHovered && l.hot ? `${color}60` : l.hot ? `${color}30` : "rgba(0,0,0,0.06)",
            boxShadow: isHovered ? `0 4px 12px ${color}0d` : "0 1px 6px rgba(0,0,0,0.06)",
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff", borderRadius: 10,
            padding: "9px 12px",
            border: l.hot ? `1px solid ${color}30` : "1px solid rgba(0,0,0,0.06)",
            transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          <motion.div 
            animate={{
              scale: isHovered && l.hot ? [1, 1.1, 1] : 1,
            }}
            transition={{
              duration: 2,
              repeat: isHovered ? Infinity : 0,
              ease: "easeInOut",
              delay: i * 0.3
            }}
            style={{ width: 30, height: 30, borderRadius: "50%",
              background: `${color}18`, color, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}
          >
            {l.name[0]}
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#222" }}>{l.name}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{l.query}</div>
          </div>
          <motion.div 
            animate={{
              scale: isHovered && l.hot ? 1.1 : 1,
            }}
            style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 800, color: l.hot ? "#ef4444" : color }}
          >
            {l.score}
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

function CafeVisual({ color, isHovered }: { color: string; isHovered?: boolean }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isHovered) {
      setCount(0);
      return;
    }
    let n = 0;
    const t = setInterval(() => {
      n += 3;
      setCount(Math.min(n, 47));
      if (n >= 47) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
  }, [isHovered]);

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <motion.div 
        animate={{
          borderColor: isHovered ? `${color}40` : "rgba(0,0,0,0.07)",
          boxShadow: isHovered ? `0 8px 24px ${color}0d` : "none",
        }}
        style={{ background: "#fff", borderRadius: 12, padding: "14px", border: "1px solid rgba(0,0,0,0.07)", transition: "border-color 0.3s, box-shadow 0.3s" }}
      >
        <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "#999", marginBottom: 6 }}>BOOKINGS TODAY</div>
        <div style={{ fontSize: 38, fontWeight: 900, color, letterSpacing: "-2px", fontFamily: "'Geist Mono', monospace", lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>tables confirmed via WhatsApp</div>
        <div style={{ marginTop: 10, height: 4, background: "rgba(0,0,0,0.05)", borderRadius: 2, overflow: "hidden" }}>
          <motion.div style={{ height: "100%", background: color, borderRadius: 2 }}
            animate={{ width: `${(count / 47) * 100}%` }}
            transition={{ duration: 0.3, ease: EASE_OUT }} />
        </div>
      </motion.div>
      <div style={{ display: "flex", gap: 7 }}>
        {["Breakfast", "Lunch", "Dinner"].map((slot, i) => (
          <motion.div key={slot}
            animate={{
              scale: isHovered && i === 2 ? 1.05 : 1,
            }}
            transition={{ duration: 0.25 }}
            style={{ flex: 1, background: i === 2 ? color : "rgba(0,0,0,0.04)",
              borderRadius: 8, padding: "8px", textAlign: "center" }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, color: i === 2 ? "#fff" : "#888" }}>{slot}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: i === 2 ? "#fff" : "#333", fontFamily: "'Geist Mono', monospace" }}>
              {[8, 14, 25][i]}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnimatedCounter({ 
  value, 
  trigger = false,
  duration = 1500 
}: { 
  value: string; 
  trigger?: boolean;
  duration?: number; 
}) {
  const [displayVal, setDisplayVal] = useState("");

  useEffect(() => {
    const raw = value.replace(/[^\d.]/g, "");
    const num = parseFloat(raw);
    
    if (!trigger) {
      if (isNaN(num)) {
        setDisplayVal(value);
      } else {
        const isDecimal = raw.includes(".");
        const decimalPlaces = isDecimal ? raw.split(".")[1].length : 0;
        const zeroWithDecimals = (0).toFixed(decimalPlaces);
        const formattedZero = value.replace(raw, zeroWithDecimals);
        setDisplayVal(formattedZero);
      }
      return;
    }

    // Extract numbers and decimals
    const match = value.match(/([\d.]+)/);
    if (!match) {
      setDisplayVal(value);
      return;
    }

    const rawNumStr = match[1];
    const target = parseFloat(rawNumStr);
    if (isNaN(target)) {
      setDisplayVal(value);
      return;
    }

    const prefix = value.substring(0, value.indexOf(rawNumStr));
    const suffix = value.substring(value.indexOf(rawNumStr) + rawNumStr.length);
    const isDecimal = rawNumStr.includes(".");
    const decimalPlaces = isDecimal ? rawNumStr.split(".")[1].length : 0;

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = progress * target;
      
      const formattedNum = current.toFixed(decimalPlaces);
      setDisplayVal(`${prefix}${formattedNum}${suffix}`);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      }
    };
    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, trigger, duration]);

  return <span>{displayVal}</span>;
}

export function UseCases() {
  const [hoveredIndustryIndex, setHoveredIndustryIndex] = useState<number | null>(null);
  const industries = [
    {
      title: "E-Commerce & Retail",
      desc: "Automate abandoned cart recovery, send order updates, handle product inquiries and COD confirmations without lifting a finger. Aries runs your post-sale flow while you sleep.",
      color: "#10B981",
      stat: { n: "3.2×", label: "conversion lift on cart recovery" },
      Visual: EcommerceVisual,
    },
    {
      title: "Healthcare & Clinics",
      desc: "Manage appointment bookings, send automated reminders, handle patient FAQs. Patients get instant answers; your staff handles only the cases that need human attention.",
      color: "#8B5CF6",
      stat: { n: "60%", label: "reduction in no-shows" },
      reverse: true,
      Visual: HealthVisual,
    },
    {
      title: "Real Estate",
      desc: "Qualify high-intent buyers automatically, answer property queries, and schedule site visits 24/7. Never let a hot lead sit unanswered on a Sunday morning again.",
      color: "#3B82F6",
      stat: { n: "4×", label: "more qualified site visits per week" },
      Visual: RealEstateVisual,
    },
    {
      title: "Cafes & Restaurants",
      desc: "Accept table reservations, send daily menu updates, run loyalty offers. Your WhatsApp becomes a direct booking channel that costs less than any aggregator.",
      color: "#D97706",
      reverse: true,
      Visual: CafeVisual,
    },
  ];

  return (
    <section id="use-cases" className="section" style={{ background: "#fff", scrollMarginTop: 68 }}>
      <div className="container">
        <Reveal>
          <div style={{ marginBottom: 56 }}>
            <h2 style={{
              fontSize: "clamp(34px,4vw,56px)",
              fontWeight: 900, letterSpacing: "-2px",
              marginTop: 16, maxWidth: 680,
              lineHeight: 1.1,
            }}>
              Built for <span style={{ color: G }}>modern businesses</span>
            </h2>
            <p style={{ fontSize: 19, color: "#374151", maxWidth: 580, marginTop: 16, lineHeight: 1.7, fontWeight: 500 }}>
              Whatever your industry, Aries adapts to your workflows.
            </p>
          </div>
        </Reveal>

        {industries.map((ind, i) => {
          const isRowHovered = hoveredIndustryIndex === i;
          const isOtherRowHovered = hoveredIndustryIndex !== null && hoveredIndustryIndex !== i;
          return (
            <Reveal key={ind.title} delay={0.05}>
              <motion.div 
                className={`industry-row${ind.reverse ? " reverse" : ""}`}
                onMouseEnter={() => setHoveredIndustryIndex(i)}
                onMouseLeave={() => setHoveredIndustryIndex(null)}
                animate={{ 
                  opacity: isOtherRowHovered ? 0.45 : 1,
                  filter: isOtherRowHovered ? "blur(1.5px)" : "blur(0px)"
                }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                style={{ 
                  cursor: "pointer",
                  transition: "opacity 0.35s ease, filter 0.35s ease",
                  marginBottom: i === industries.length - 1 ? 0 : 36
                }}
              >
                <div className="industry-text">
                  <h3 style={{
                    fontSize: "clamp(20px,2.5vw,30px)",
                    fontWeight: 700, letterSpacing: "-0.5px",
                    marginBottom: 14,
                    color: isRowHovered ? ind.color : "inherit",
                    transition: "color 0.3s ease",
                  }}>
                    {ind.title}
                  </h3>
                  <p style={{ fontSize: 15.5, color: "#666", lineHeight: 1.75, marginBottom: 24 }}>
                    {ind.desc}
                  </p>
                  {ind.stat && (
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 12,
                        background: isRowHovered ? `${ind.color}15` : `${ind.color}0a`,
                        border: isRowHovered ? `1px solid ${ind.color}35` : `1px solid ${ind.color}22`,
                        borderRadius: 12, padding: "12px 20px", cursor: "default",
                        transition: "background 0.3s ease, border 0.3s ease",
                      }}
                    >
                      <span style={{
                        fontSize: 30, fontWeight: 900, color: ind.color,
                        letterSpacing: "-1px", fontFamily: "'Geist Mono', monospace",
                      }}><AnimatedCounter value={ind.stat.n} trigger={isRowHovered} /></span>
                      <span style={{ fontSize: 13, color: "#888", maxWidth: 140, lineHeight: 1.4 }}>{ind.stat.label}</span>
                    </motion.div>
                  )}
                </div>

                {/* Visual mockup card wrapper */}
                <motion.div 
                  animate={{
                    scale: isRowHovered ? 1.05 : 1,
                    y: isRowHovered ? -8 : 0,
                  }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  style={{
                    background: isRowHovered ? `${ind.color}0c` : `${ind.color}06`,
                    border: isRowHovered ? `1px solid ${ind.color}45` : `1px solid ${ind.color}18`,
                    borderRadius: 20, padding: "28px 24px",
                    minHeight: 220,
                    display: "flex", alignItems: "center",
                    position: "relative",
                    overflow: "visible", // for absolute glow overlays
                    boxShadow: isRowHovered 
                      ? `0 20px 40px ${ind.color}15, 0 0 24px ${ind.color}0a`
                      : "none",
                    transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
                  }}
                >
                  <ind.Visual color={ind.color} isHovered={isRowHovered} />
                </motion.div>
              </motion.div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function Integrations() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [hoveredIntegration, setHoveredIntegration] = useState<string | null>(null);

  const leftIntegrations = [
    { name: "Google Sheets", color: "#34A853", initial: "GS", live: true },
    { name: "Google Calendar", color: "#4285F4", initial: "GC", live: true },
    { name: "Pabbly Connect", color: "#FF6B35", initial: "PB", live: true },
  ];

  const rightIntegrations = [
    { name: "Meta Ads & Pixel", color: "#1877F2", initial: "MB", live: true },
    { name: "Razorpay", color: "#3395FF", initial: "RZ", live: true },
    { name: "Shiprocket", color: "#2D9CDB", initial: "SR", live: true },
  ];

  const allIntegrations = [...leftIntegrations, ...rightIntegrations];
  const hoveredItem = allIntegrations.find(it => it.name === hoveredIntegration);

  // SVG canvas dimensions
  const W = 1200;
  const H = 700;
  const CX = W / 2;
  const CY = H / 2;

  // Left node positions (spread vertically for 3 nodes across 700px)
  const leftY  = [120, 350, 580];
  const rightY = [120, 350, 580];

  // Build curved path string from a side node to center
  const makePath = (x: number, y: number, side: "left" | "right") => {
    const cp1x = side === "left" ? x + (CX - x) * 0.55 : x - (x - CX) * 0.55;
    const cp2x = side === "left" ? CX - 120 : CX + 120;
    return `M ${x} ${y} C ${cp1x} ${y}, ${cp2x} ${CY}, ${CX} ${CY}`;
  };

  const pathColors = ["#25d366", "#25d366", "#25d366"];

  return (
    <section style={{
      background: "#0c0e14",
      borderTopLeftRadius: "50% 30px",
      borderTopRightRadius: "50% 30px",
      borderBottomLeftRadius: "50% 30px",
      borderBottomRightRadius: "50% 30px",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      marginTop: "-30px",
      padding: "120px 40px 140px",
      position: "relative",
      zIndex: 10,
      overflow: "hidden",
    }}>
      {/* ambient glow */}
      <motion.div 
        animate={{
          background: hoveredItem 
            ? `radial-gradient(ellipse, ${hoveredItem.color}0a 0%, transparent 65%)`
            : "radial-gradient(ellipse, rgba(37,211,102,0.07) 0%, transparent 65%)"
        }}
        transition={{ duration: 0.4 }}
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600, height: 600,
          pointerEvents: "none",
        }} 
      />

      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2 style={{
              fontSize: "clamp(34px,4vw,56px)",
              fontWeight: 900, letterSpacing: "-2.5px",
              color: "#fff", marginBottom: 16,
              lineHeight: 1.1,
            }}>
              Connect Aries with your
              <span style={{ color: G }}> existing stack</span>
            </h2>
            <p style={{ fontSize: 19, color: "#9ca3af", maxWidth: 640, margin: "0 auto", lineHeight: 1.7 }}>
              Plug into the tools your team already uses: CRM, payments, sheets, automation and more.
            </p>
          </div>
        </Reveal>

        {/* Hub diagram */}
        <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 1200, margin: "0 auto" }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: "auto", overflow: "visible" }}
          >
            <defs>
              {/* Animated dash for path draw-on */}
              <style>{`
                @keyframes flowDot {
                  0%   { stroke-dashoffset: 600; opacity: 0; }
                  5%   { opacity: 1; }
                  95%  { opacity: 1; }
                  100% { stroke-dashoffset: 0;   opacity: 0; }
                }
                @keyframes drawPath {
                  from { stroke-dashoffset: 600; }
                  to   { stroke-dashoffset: 0; }
                }
              `}</style>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              
              {/* Radial spotlight gradients for each integration */}
              {allIntegrations.map(item => (
                <radialGradient
                  key={item.name}
                  id={`glow-${item.name.replace(/[^a-zA-Z0-9]/g, "-")}`}
                  cx="50%" cy="0%" r="60%"
                >
                  <stop offset="0%" stopColor={item.color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={item.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            {/* LEFT paths + nodes */}
            {leftIntegrations.map((item, i) => {
              const x = 180, y = leftY[i];
              const d = makePath(x + 116, y, "left");
              const delay = i * 0.18;
              const dotDelay = i * 0.4;
              
              const isHovered = hoveredIntegration === item.name;
              const isOtherHovered = hoveredIntegration !== null && hoveredIntegration !== item.name;
              
              return (
                <g key={item.name}>
                  {/* Curved Connection Path */}
                  <motion.path
                    d={d}
                    fill="none"
                    strokeWidth={1.5}
                    opacity={0.7}
                    animate={{
                      stroke: isHovered ? item.color : isOtherHovered ? "rgba(37,211,102,0.06)" : pathColors[i],
                      strokeWidth: isHovered ? 2.5 : isOtherHovered ? 1.0 : 1.5,
                      opacity: isHovered ? 1.0 : isOtherHovered ? 0.2 : 0.7,
                    }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    strokeDasharray="600"
                    strokeDashoffset={inView ? "0" : "600"}
                    style={{
                      transition: `stroke-dashoffset 1.1s cubic-bezier(0.23,1,0.32,1) ${delay}s`,
                    }}
                  />
                  {/* Staggered Train of 3 Flowing Dots */}
                  {inView && (
                    <motion.g
                      initial={{ opacity: 0.8 }}
                      animate={{
                        opacity: isHovered ? 1.0 : isOtherHovered ? 0.15 : 0.8,
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      {[0, 1, 2].map((dotIndex) => {
                        const startDelay = dotDelay + (dotIndex * 0.8);
                        return (
                          <circle 
                            key={dotIndex} 
                            r={isHovered ? 4.5 : 3.5} 
                            fill={isHovered ? item.color : "#25d366"} 
                            filter="url(#glow)"
                            visibility="hidden"
                          >
                            <set 
                              attributeName="visibility" 
                              to="visible" 
                              begin={`${startDelay}s`} 
                            />
                            <animateMotion
                              dur="2.4s"
                              repeatCount="indefinite"
                              begin={`${startDelay}s`}
                              path={d}
                            />
                          </circle>
                        );
                      })}
                    </motion.g>
                  )}
                  {/* Integration chip */}
                  <motion.g
                    onMouseEnter={() => setHoveredIntegration(item.name)}
                    onMouseLeave={() => setHoveredIntegration(null)}
                    style={{
                      transformOrigin: `${x}px ${y}px`,
                      cursor: "pointer",
                    }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{
                      scale: isHovered ? 1.06 : isOtherHovered ? 0.94 : (inView ? 1 : 0.95),
                      opacity: inView ? (isOtherHovered ? 0.45 : 1) : 0,
                      filter: isOtherHovered ? "blur(1.5px)" : "blur(0px)",
                    }}
                    transition={{
                      scale: { duration: 0.3, ease: EASE_OUT },
                      opacity: { duration: 0.3 },
                      filter: { duration: 0.3 }
                    }}
                  >
                    <motion.rect
                      x={x - 140} y={y - 34}
                      width={280} height={68}
                      rx={18}
                      strokeWidth={1.2}
                      animate={{
                        fill: isHovered ? `${item.color}1c` : isOtherHovered ? "rgba(37,211,102,0.02)" : "rgba(37,211,102,0.06)",
                        stroke: isHovered ? item.color : isOtherHovered ? "rgba(37,211,102,0.08)" : "rgba(37,211,102,0.25)",
                        strokeWidth: isHovered ? 2.0 : 1.2,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                    {/* Spotlight glow overlay */}
                    {isHovered && (
                      <rect
                        x={x - 140} y={y - 34}
                        width={280} height={68}
                        rx={18}
                        fill={`url(#glow-${item.name.replace(/[^a-zA-Z0-9]/g, "-")})`}
                        pointerEvents="none"
                      />
                    )}
                    <motion.text
                      x={x} y={y}
                      textAnchor="middle" dominantBaseline="central"
                      animate={{
                        fill: isHovered ? "#ffffff" : isOtherHovered ? "rgba(255,255,255,0.3)" : "#ffffff",
                        scale: isHovered ? 1.02 : 1,
                      }}
                      transition={{ duration: 0.3 }}
                      style={{
                        fontSize: 22, fontWeight: 700,
                        fontFamily: "Geist, Inter, sans-serif",
                        letterSpacing: "-0.5px"
                      }}
                    >{item.name}</motion.text>
                    {/* Live / Soon badge */}
                    <circle cx={x + 116} cy={y} r={5.5}
                      fill="#25d366"
                    />
                    <circle cx={x + 116} cy={y} r={5.5} fill="#25d366" opacity={0.4}>
                      <animate attributeName="r" values="5.5;9.5;5.5" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </motion.g>
                </g>
              );
            })}

            {/* RIGHT paths + nodes */}
            {rightIntegrations.map((item, i) => {
              const x = W - 180, y = rightY[i];
              const d = makePath(x - 116, y, "right");
              const delay = i * 0.18 + 0.1;
              const dotDelay = i * 0.4 + 0.5;
              
              const isHovered = hoveredIntegration === item.name;
              const isOtherHovered = hoveredIntegration !== null && hoveredIntegration !== item.name;
              
              return (
                <g key={item.name}>
                  {/* Curved Connection Path */}
                  <motion.path
                    d={d}
                    fill="none"
                    strokeWidth={1.5}
                    opacity={0.7}
                    animate={{
                      stroke: isHovered ? item.color : isOtherHovered ? "rgba(37,211,102,0.06)" : pathColors[i],
                      strokeWidth: isHovered ? 2.5 : isOtherHovered ? 1.0 : 1.5,
                      opacity: isHovered ? 1.0 : isOtherHovered ? 0.2 : 0.7,
                    }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    strokeDasharray="600"
                    strokeDashoffset={inView ? "0" : "600"}
                    style={{
                      transition: `stroke-dashoffset 1.1s cubic-bezier(0.23,1,0.32,1) ${delay}s`,
                    }}
                  />
                  {/* Staggered Train of 3 Flowing Dots */}
                  {inView && (
                    <motion.g
                      initial={{ opacity: 0.8 }}
                      animate={{
                        opacity: isHovered ? 1.0 : isOtherHovered ? 0.15 : 0.8,
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      {[0, 1, 2].map((dotIndex) => {
                        const startDelay = dotDelay + (dotIndex * 0.8);
                        return (
                          <circle 
                            key={dotIndex} 
                            r={isHovered ? 4.5 : 3.5} 
                            fill={isHovered ? item.color : "#25d366"} 
                            filter="url(#glow)"
                            visibility="hidden"
                          >
                            <set 
                              attributeName="visibility" 
                              to="visible" 
                              begin={`${startDelay}s`} 
                            />
                            <animateMotion
                              dur="2.4s"
                              repeatCount="indefinite"
                              begin={`${startDelay}s`}
                              path={d}
                              keyPoints="1;0"
                              keyTimes="0;1"
                              calcMode="linear"
                            />
                          </circle>
                        );
                      })}
                    </motion.g>
                  )}
                  <motion.g
                    onMouseEnter={() => setHoveredIntegration(item.name)}
                    onMouseLeave={() => setHoveredIntegration(null)}
                    style={{
                      transformOrigin: `${x}px ${y}px`,
                      cursor: "pointer",
                    }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{
                      scale: isHovered ? 1.06 : isOtherHovered ? 0.94 : (inView ? 1 : 0.95),
                      opacity: inView ? (isOtherHovered ? 0.45 : 1) : 0,
                      filter: isOtherHovered ? "blur(1.5px)" : "blur(0px)",
                    }}
                    transition={{
                      scale: { duration: 0.3, ease: EASE_OUT },
                      opacity: { duration: 0.3 },
                      filter: { duration: 0.3 }
                    }}
                  >
                    <motion.rect
                      x={x - 140} y={y - 34}
                      width={280} height={68}
                      rx={18}
                      strokeWidth={1.2}
                      animate={{
                        fill: isHovered ? `${item.color}1c` : isOtherHovered ? "rgba(37,211,102,0.02)" : "rgba(37,211,102,0.06)",
                        stroke: isHovered ? item.color : isOtherHovered ? "rgba(37,211,102,0.08)" : "rgba(37,211,102,0.25)",
                        strokeWidth: isHovered ? 2.0 : 1.2,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                    {/* Spotlight glow overlay */}
                    {isHovered && (
                      <rect
                        x={x - 140} y={y - 34}
                        width={280} height={68}
                        rx={18}
                        fill={`url(#glow-${item.name.replace(/[^a-zA-Z0-9]/g, "-")})`}
                        pointerEvents="none"
                      />
                    )}
                    <motion.text
                      x={x} y={y}
                      textAnchor="middle" dominantBaseline="central"
                      animate={{
                        fill: isHovered ? "#ffffff" : isOtherHovered ? "rgba(255,255,255,0.3)" : "#ffffff",
                        scale: isHovered ? 1.02 : 1,
                      }}
                      transition={{ duration: 0.3 }}
                      style={{
                        fontSize: 22, fontWeight: 700,
                        fontFamily: "Geist, Inter, sans-serif",
                        letterSpacing: "-0.5px"
                      }}
                    >{item.name}</motion.text>
                    <circle cx={x - 116} cy={y} r={5.5}
                      fill="#25d366"
                    />
                    <circle cx={x - 116} cy={y} r={5.5} fill="#25d366" opacity={0.4}>
                      <animate attributeName="r" values="5.5;9.5;5.5" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </motion.g>
                </g>
              );
            })}

            {/* Center hub */}
            <g>
              {/* Outer pulse ring */}
              <motion.circle 
                cx={CX} cy={CY} r={80} fill="none" 
                animate={{
                  stroke: hoveredItem ? `${hoveredItem.color}1e` : "rgba(37,211,102,0.12)"
                }}
                transition={{ duration: 0.3 }}
                strokeWidth={36} 
              />
              <motion.circle 
                cx={CX} cy={CY} r={68} fill="rgba(37,211,102,0.08)" 
                animate={{
                  stroke: hoveredItem ? `${hoveredItem.color}3f` : "rgba(37,211,102,0.25)"
                }}
                transition={{ duration: 0.3 }}
                strokeWidth={2} 
              />
              <motion.circle 
                cx={CX} cy={CY} r={56} fill="#ffffff" 
                animate={{
                  stroke: hoveredItem ? hoveredItem.color : "#25d366"
                }}
                transition={{ duration: 0.3 }}
                strokeWidth={4} 
                style={{ filter: 'drop-shadow(0 0 12px rgba(37,211,102,0.25))' }} 
              />
              {/* Branded Favicon PNG Icon */}
              <image
                href="/favicon.png"
                x={CX - 40}
                y={CY - 40}
                width={80}
                height={80}
              />
            </g>

            {/* Concentric expanding pulse rings in center */}
            {inView && [
              { r: 76, dur: "2.4s", begin: "0s" },
              { r: 84, dur: "2.4s", begin: "0.8s" },
              { r: 92, dur: "2.4s", begin: "1.6s" },
            ].map((ring, ri) => (
              <circle key={ri} cx={CX} cy={CY} r={ring.r} fill="none" stroke={hoveredItem ? hoveredItem.color : G} strokeWidth={1.5}>
                <animate attributeName="opacity" values="0.6;0" dur={ring.dur} repeatCount="indefinite" begin={ring.begin} />
                <animate attributeName="r" values={`${ring.r};${ring.r + 40}`} dur={ring.dur} repeatCount="indefinite" begin={ring.begin} />
              </circle>
            ))}
          </svg>
        </div>

        {/* Google OAuth note — required for Google verification */}
        <div style={{
          marginTop: 56,
          display: "flex",
          justifyContent: "center",
        }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: "10px 22px",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="#9ca3af" strokeWidth="1.8"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 13.5, color: "#9ca3af", lineHeight: 1.5 }}>
              Google integrations use secure OAuth — AriesAI connects to{" "}
              <span style={{ color: "#d1d5db" }}>Google Calendar</span> and{" "}
              <span style={{ color: "#d1d5db" }}>Google Sheets</span>{" "}
              to automate bookings and sync leads. We request only the minimum permissions needed.
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   HOW IT WORKS — 3 steps (acceptable because steps aren't cards)
───────────────────────────────────────────────────────────────────────── */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const steps = [
    {
      n: "01",
      Icon: <IconPhone />,
      title: "Connect WhatsApp",
      desc: "Link your WhatsApp Business number. Step-by-step guidance gets you live in 10 minutes.",
      detail: "No tech skills needed",
    },
    {
      n: "02",
      Icon: <IconBrain />,
      title: "Configure Your AI",
      desc: "Tell us your business, services, and FAQs. Aries learns your business instantly.",
      detail: "Trained in minutes",
    },
    {
      n: "03",
      Icon: <IconTrendUp />,
      title: "Watch Leads Flow",
      desc: "Your AI replies 24/7. Track everything in real-time from your dashboard.",
      detail: "Live analytics",
    },
  ];

  return (
    <section id="how-it-works" className="section" style={{ background: "#f7f8fa", scrollMarginTop: 68 }}>
      <div className="container">
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <h2 style={{
              fontSize: "clamp(34px,4vw,56px)",
              fontWeight: 900, letterSpacing: "-2px",
              marginBottom: 16,
              lineHeight: 1.1,
            }}>
              Live in <span style={{ color: G }}>under 10 minutes</span>
            </h2>
            <p style={{ fontSize: 19, color: "#4b5563", maxWidth: 500, margin: "0 auto", fontWeight: 500 }}>
              Three simple steps. No developer. No waiting.
            </p>
          </div>
        </Reveal>

        {/* Animated progress bar — Ultra Premium Crossing Wave Paths */}
        <div ref={ref} style={{ position: "relative", marginBottom: 56, maxWidth: 480, width: "100%", height: 80, margin: "0 auto 64px" }}>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 480 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ overflow: "visible" }}
          >
            <defs>
              {/* Premium Glow Filters */}
              <filter id="glow-accent" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-particle" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 2 0" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Gradients */}
              <linearGradient id="wave-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={G} />
                <stop offset="50%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="wave-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor={G} />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Gray baseline path 1 */}
            <path
              d="M 24 40 C 78 15, 186 65, 240 40 C 294 15, 402 65, 456 40"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Gray baseline path 2 */}
            <path
              d="M 24 40 C 78 65, 186 15, 240 40 C 294 65, 402 15, 456 40"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Glowing active path 1 (Framer motion pathLength reveal) */}
            <motion.path
              d="M 24 40 C 78 15, 186 65, 240 40 C 294 15, 402 65, 456 40"
              stroke="url(#wave-grad-1)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.6, ease: EASE_IN_OUT, delay: 0.2 }}
            />
            {/* Glowing neon shadow path 1 */}
            <motion.path
              d="M 24 40 C 78 15, 186 65, 240 40 C 294 15, 402 65, 456 40"
              stroke="url(#wave-grad-1)"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.3"
              filter="url(#glow-accent)"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.6, ease: EASE_IN_OUT, delay: 0.2 }}
            />

            {/* Glowing active path 2 (Framer motion pathLength reveal) */}
            <motion.path
              d="M 24 40 C 78 65, 186 15, 240 40 C 294 65, 402 15, 456 40"
              stroke="url(#wave-grad-2)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.6, ease: EASE_IN_OUT, delay: 0.2 }}
            />
            {/* Glowing neon shadow path 2 */}
            <motion.path
              d="M 24 40 C 78 65, 186 15, 240 40 C 294 65, 402 15, 456 40"
              stroke="url(#wave-grad-2)"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.3"
              filter="url(#glow-accent)"
              initial={{ pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.6, ease: EASE_IN_OUT, delay: 0.2 }}
            />

            {/* Energy Particle Spark 1 (Infinitely flows along Path 1) */}
            {inView && (
              <g filter="url(#glow-particle)">
                <circle r="4.5" fill="#4ade80">
                  <animateMotion
                    dur="4s"
                    repeatCount="indefinite"
                    path="M 24 40 C 78 15, 186 65, 240 40 C 294 15, 402 65, 456 40"
                  />
                </circle>
              </g>
            )}

            {/* Energy Particle Spark 2 (Infinitely flows along Path 2, staggered) */}
            {inView && (
              <g filter="url(#glow-particle)">
                <circle r="4.5" fill="#25D366">
                  <animateMotion
                    dur="4s"
                    begin="2s"
                    repeatCount="indefinite"
                    path="M 24 40 C 78 65, 186 15, 240 40 C 294 65, 402 15, 456 40"
                  />
                </circle>
              </g>
            )}

            {/* Milestones: Step 1, Step 2, Step 3 */}
            {[
              { cx: 24, delay: 0.3 },
              { cx: 240, delay: 0.75 },
              { cx: 456, delay: 1.2 },
            ].map((milestone, idx) => {
              const isCardHovered = hoveredIndex === idx;
              return (
                <g key={idx}>
                  {/* Outer Glassmorphic boundary ring */}
                  <motion.circle
                    cx={milestone.cx}
                    cy="40"
                    r="14"
                    fill="#ffffff"
                    stroke={isCardHovered ? "rgba(37,211,102,0.4)" : "rgba(0,0,0,0.06)"}
                    strokeWidth="1.5"
                    style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.04))" }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={inView ? { scale: isCardHovered ? 1.25 : 1, opacity: 1 } : {}}
                    transition={{ duration: 0.35, delay: inView ? 0 : milestone.delay, ease: EASE_OUT }}
                  />

                  {/* Pulsing ring */}
                  {inView && (
                    <motion.circle
                      cx={milestone.cx}
                      cy="40"
                      r={isCardHovered ? 12 : 10}
                      stroke={G}
                      strokeWidth="1.5"
                      fill="none"
                      animate={{ 
                        scale: isCardHovered ? [1, 2.1, 1] : [1, 1.7, 1], 
                        opacity: isCardHovered ? [0.9, 0, 0.9] : [0.7, 0, 0.7] 
                      }}
                      transition={{ 
                        duration: isCardHovered ? 1.5 : 2.2, 
                        repeat: Infinity, 
                        ease: "easeInOut", 
                        delay: isCardHovered ? 0 : milestone.delay 
                      }}
                    />
                  )}

                  {/* Inner solid milestone dot */}
                  <motion.circle
                    cx={milestone.cx}
                    cy="40"
                    r={isCardHovered ? 8 : 6.5}
                    fill={G}
                    initial={{ scale: 0 }}
                    animate={inView ? { scale: isCardHovered ? 1.25 : 1 } : {}}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                    style={{ filter: `drop-shadow(0 0 ${isCardHovered ? 8 : 4}px ${G})` }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="steps-grid">
          {steps.map((step, i) => {
            const isHovered = hoveredIndex === i;
            const isOtherHovered = hoveredIndex !== null && hoveredIndex !== i;
            return (
              <Reveal key={step.n} delay={i * 0.12}>
                <motion.div
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  animate={{ 
                    scale: isHovered ? 1.05 : isOtherHovered ? 0.95 : 1, 
                    y: isHovered ? -12 : 0,
                    opacity: isOtherHovered ? 0.35 : 1,
                    filter: isOtherHovered ? "blur(1.5px)" : "blur(0px)"
                  }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: "32px 28px",
                    border: isHovered ? "1px solid rgba(37,211,102,0.4)" : "1px solid rgba(0,0,0,0.06)",
                    textAlign: "center",
                    position: "relative",
                    boxShadow: isHovered 
                      ? "0 24px 48px rgba(37,211,102,0.14), 0 0 24px rgba(37,211,102,0.08)"
                      : "0 2px 12px rgba(0,0,0,0.04)",
                    cursor: "pointer",
                    transition: "border 0.3s ease, box-shadow 0.3s ease",
                    overflow: "visible",
                  }}
                >
                  {/* Subtle top spotlight shine overlay */}
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "radial-gradient(circle at 50% 0%, rgba(37,211,102,0.06) 0%, transparent 70%)",
                        pointerEvents: "none",
                        borderRadius: 20,
                        zIndex: 0,
                      }}
                    />
                  )}

                  {/* Number badge */}
                  <div style={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                    background: isHovered ? "#128C7E" : G, color: "#fff",
                    padding: "3px 12px", borderRadius: 100,
                    boxShadow: isHovered ? "0 0 12px rgba(37,211,102,0.4)" : "none",
                    transition: "background-color 0.3s, box-shadow 0.3s",
                    zIndex: 1,
                  }}>STEP {step.n}</div>

                  {/* Animated icon circle */}
                  <motion.div
                    animate={{ 
                      boxShadow: isHovered 
                        ? ["0 0 0 0px rgba(37,211,102,0.5)", "0 0 0 14px rgba(37,211,102,0.12)", "0 0 0 0px rgba(37,211,102,0.0)"] 
                        : ["0 0 0 0px rgba(37,211,102,0.3)", "0 0 0 8px rgba(37,211,102,0.08)", "0 0 0 0px rgba(37,211,102,0.0)"],
                      scale: isHovered ? 1.1 : 1
                    }}
                    transition={{ 
                      boxShadow: { duration: isHovered ? 1.8 : 2.5, repeat: Infinity, delay: i * 0.3 },
                      scale: { duration: 0.3, ease: EASE_OUT }
                    }}
                    style={{
                      width: 64, height: 64, borderRadius: "50%",
                      background: isHovered ? "rgba(37,211,102,0.15)" : "rgba(37,211,102,0.08)",
                      border: isHovered ? `2px solid rgba(37,211,102,0.5)` : `2px solid rgba(37,211,102,0.25)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "20px auto 20px",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <div style={{ width: 26, height: 26, color: G, stroke: G, fill: "none",
                      strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }}>
                      {step.Icon}
                    </div>
                  </motion.div>

                  <h3 style={{ 
                    fontSize: 19, 
                    fontWeight: 700, 
                    marginBottom: 10, 
                    letterSpacing: "-0.4px",
                    color: isHovered ? "#111" : "#1f2937",
                    transform: isHovered ? "scale(1.02)" : "scale(1)",
                    transition: "color 0.3s, transform 0.3s",
                    transformOrigin: "center",
                    position: "relative",
                    zIndex: 1,
                  }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 13.5, color: "#777", lineHeight: 1.7, marginBottom: 16, position: "relative", zIndex: 1 }}>
                    {step.desc}
                  </p>

                  {/* Detail tag */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: GD,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    position: "relative",
                    zIndex: 1,
                  }}>
                    {step.detail}
                  </div>
                </motion.div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PRICING                                                                   
───────────────────────────────────────────────────────────────────────── */
export function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const plans = [
    {
      name: "Starter", price: "3,999", oldPrice: "",
      desc: "For small businesses starting on WhatsApp",
      caps: ["1 Agent Seat", "2,000 conversations/month"],
      features: [
        "1 Team Member / Agent",
        "2,000 Conversations / month",
        "WhatsApp Business API Access",
        "Shared Inbox",
        "Manual Live Chat",
        "Contact Management",
        "Broadcast Campaigns",
        "Basic Customer Segmentation",
        "Chat Labels / Tags",
        "AI FAQ Assistant (Basic)",
        "Basic Analytics Dashboard",
        "Click-to-WhatsApp Widget",
        "Blue Tick Guidance Support",
        "₹100 Trial Credits"
      ],
      cta: "Start Free Trial", popular: false,
    },
    {
      name: "Growth", price: "5,999", oldPrice: "",
      desc: "Everything in Starter +",
      caps: ["3 Team Members", "10,000 conversations/month"],
      features: [
        "3 Team Members",
        "10,000 Conversations / month",
        "Advanced AI FAQ Chatbot",
        "Hindi + English + Hinglish AI",
        "Smart Customer Segments",
        "Auto Replies & Smart Workflows",
        "Drip Campaigns / Follow-ups",
        "Lead Capture Forms",
        "Custom Attributes & Tags",
        "Broadcast Scheduling",
        "Priority Support",
        "Appointment Reminders",
        "Cart Recovery / Follow-up Automation",
        "AI Lead Qualification",
        "Basic CRM Sync"
      ],
      cta: "Start Free Trial", popular: true,
    },
    {
      name: "Pro", price: "7,999", oldPrice: "",
      desc: "For businesses scaling operations and automations",
      caps: ["5 Team Members", "25,000 conversations/month"],
      features: [
        "5 Team Members",
        "25,000 Conversations / month",
        "Visual Workflow Builder",
        "Unlimited Automation Flows",
        "CRM Integrations",
        "Google Sheets Sync",
        "Lead Scoring & Alerts",
        "Conversion Analytics",
        "Advanced Customer Journey Builder",
        "AI Intent Detection",
        "Team Assignment Rules",
        "Sales Pipeline Tracking",
        "API/Webhook Access",
        "Advanced Analytics Dashboard",
        "Custom Automation Rules"
      ],
      cta: "Start Free Trial", popular: false,
    },
    {
      name: "Ultra", price: "Custom", oldPrice: "",
      desc: "Everything in Pro +",
      caps: ["Unlimited Team Members", "Unlimited conversations"],
      features: [
        "Unlimited Team Members",
        "Unlimited Conversations",
        "Dedicated AI Model Training",
        "AI Voice Calling Agent",
        "Custom Integrations",
        "White-label Reports",
        "SLA + Dedicated Account Manager",
        "Enterprise Security Controls",
        "Multi-Branch Management",
        "Priority Infrastructure",
        "Custom Workflows",
        "Dedicated Success Manager",
        "Custom API Limits",
        "WhatsApp Commerce Automation"
      ],
      cta: "Contact Sales", popular: false,
    },
  ];

  const getPrice = (p: string) => {
    if (p === "Custom") return "Custom";
    const n = parseInt(p.replace(",", ""));
    if (isNaN(n)) return p;
    return billing === "annual" ? Math.round(n * 0.9).toLocaleString("en-IN") : p;
  };

  return (
    <section id="pricing" className="section" style={{ background: "#fff", scrollMarginTop: 68 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 40px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: "clamp(34px,4vw,56px)", fontWeight: 900, letterSpacing: "-2.5px", marginTop: 0, lineHeight: 1.1 }}>
              Choose Your <span style={{ color: G }}>Growth</span> Plan
            </h2>
            <p style={{ color: "#374151", fontSize: 19, marginTop: 16, fontWeight: 500 }}>
              No hidden charges. All plans include WhatsApp Business API.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 40 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: billing === "monthly" ? "#111" : "#999", cursor: "pointer" }}
              onClick={() => setBilling("monthly")}>Monthly</span>
            <button className={`t-switch${billing === "annual" ? " on" : ""}`}
              onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
              aria-label="Toggle billing">
              <span className="t-thumb" />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: billing === "annual" ? "#111" : "#999", cursor: "pointer" }}
              onClick={() => setBilling("annual")}>
              Annual <span style={{ background: "#dcfce7", color: GD, fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "2px 8px", marginLeft: 4 }}>Save 10%</span>
            </span>
          </div>
        </Reveal>

        <div className="pricing-grid">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.06}>
              <div className="pc" style={{ height: "100%" }}>
                {plan.popular && (
                  <div className="pop-badge" style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    background: G, color: "#fff", padding: "5px 16px", borderRadius: 100,
                    fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    display: "flex", alignItems: "center", gap: 6, justifyContent: "center"
                  }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" style={{ fill: "#fff", stroke: "none" }}>
                      <path d="M12 2c0 0 6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 6-10 6-10z" />
                    </svg>
                    <span>Most Popular</span>
                  </div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{plan.name}</h3>
                <p className="pd" style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{plan.desc}</p>
                <div style={{ marginBottom: 20 }}>
                  {plan.price !== "Custom" && (
                    <span className="ps" style={{ fontSize: 14 }}>₹</span>
                  )}
                  <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-2px" }}>
                    {getPrice(plan.price)}
                  </span>
                  {plan.price !== "Custom" && (
                    <span className="ps" style={{ fontSize: 13 }}>/month</span>
                  )}
                  {billing === "annual" && plan.price !== "Custom" && (
                    <div style={{ fontSize: 12, color: G, fontWeight: 600, marginTop: 4 }}>Billed annually</div>
                  )}
                </div>
                <motion.div whileTap={{ scale: 0.98 }}>
                  <Link href={plan.price === "Custom" ? "#contact-us" : "/signup"} className="pb" style={{ display: "block" }}>
                    {plan.cta}
                  </Link>
                </motion.div>
                <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "20px 0 16px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {plan.caps.map(c => (
                    <div key={c} style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "flex", gap: 6, alignItems: "center" }}>
                      <svg viewBox="0 0 24 24" width="12" height="12" style={{ stroke: G, fill: "none", strokeWidth: 2.5, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                      {c}
                    </div>
                  ))}
                </div>
                <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "0 0 16px" }} />
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9, padding: 0 }}>
                  {plan.features.map(f => (
                    <li key={f} className="pf" style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start", lineHeight: 1.5 }}>
                      <IconCheck />{f}
                    </li>
                  ))}
                </ul>

                <div className="tmpl-section">
                  <div className="tmpl-title">Per Template Message Charges</div>
                  <div className="tmpl-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#25D366", fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Marketing: <strong style={{ fontWeight: 800 }}>₹1.09</strong></span>
                  </div>
                  <div className="tmpl-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#25D366", fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Utility: <strong style={{ fontWeight: 800 }}>₹0.145</strong></span>
                  </div>
                  <div className="tmpl-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#25D366", fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Authentication: <strong style={{ fontWeight: 800 }}>₹0.145</strong></span>
                  </div>
                  <div className="tmpl-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" style={{ stroke: "#25D366", fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Service: <strong style={{ fontWeight: 800 }}>Unlimited Free</strong></span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", paddingTop: 40 }}>
            {[
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#888" }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                text: "Secure Payments"
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#888" }}>
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                ),
                text: "Cancel Anytime"
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#888" }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                ),
                text: "14-Day Free Trial"
              },
              {
                icon: (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#888" }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ),
                text: "UPI, Cards & Net Banking"
              },
            ].map(t => (
              <span key={t.text} style={{ fontSize: 13, color: "#aaa", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                {t.icon} {t.text}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FAQ                                                                       
───────────────────────────────────────────────────────────────────────── */
function FAQItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{
      borderBottom: "1px solid var(--rule)",
      paddingTop: 20,
      paddingBottom: 20,
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
          color: "var(--ink)",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.3px" }}
          className="faq-question-text"
        >
          {question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: isOpen ? "rgba(37,211,102,0.08)" : "transparent",
            color: isOpen ? "var(--g)" : "var(--ink3)",
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </motion.span>
      </button>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{ overflow: "hidden" }}
          >
            <p style={{
              fontSize: 15,
              color: "var(--ink3)",
              lineHeight: 1.65,
            }}>
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  const faqs = [
    {
      q: "How does the AI work? Does it need pre-configured templates?",
      a: "No. Aries AI uses state-of-the-art Large Language Models (LLMs) that understand natural language dynamically. You simply connect your website, upload PDFs, or link Google Sheets, and the AI constructs contextual, accurate responses in real-time. No rigid, complex flowcharts or pre-written templates needed for standard chats."
    },
    {
      q: "Will my WhatsApp Business number get banned?",
      a: "Absolutely not. Aries AI works 100% via the Official Meta Cloud API. By adhering to Meta's strict policies (e.g., using pre-approved templates for outbound broadcasts and dynamically answering incoming support chats), your business remains fully compliant and safe from standard platform bans."
    },
    {
      q: "Does it support multiple Indian languages and Hinglish?",
      a: "Yes! Aries AI is specifically trained for the Indian market. It responds flawlessly in Hindi (written in either Devanagari or English alphabets), English, and Hinglish (slang blend of Hindi/English). It also supports Tamil, Telugu, Marathi, Gujarati, Kannada, and Bengali seamlessly."
    },
    {
      q: "How do I train the AI on my product information?",
      a: "Training takes less than two minutes. You can enter your website URL, paste text, link a live Google Sheet, or upload documents (like PDFs, TXT, or Word files). The AI crawls this data automatically and is immediately ready to answer user questions about pricing, features, or support."
    },
    {
      q: "Does it integrate with my existing tools (CRMs, sheets)?",
      a: "Yes. Aries AI has first-class integrations with Google Sheets, Google Calendar, Meta Pixel, Shiprocket, and Razorpay. Additionally, you can trigger webhooks or connect it to tools like Pabbly Connect or Zapier to push lead data directly into any CRM or database."
    },
    {
      q: "Is there a free trial? Do I need a credit card to sign up?",
      a: "Yes, we offer a 14-day fully-featured free trial. You do not need to enter any credit card or billing information to start. Simply sign up, connect a phone number (or use our sandbox number), and start automating immediately."
    }
  ];

  return (
    <section id="faq" className="section" style={{ background: "#f7f8fa", borderTop: "1px solid var(--rule)", scrollMarginTop: 68 }}>
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "0 40px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <Label>Frequently Asked Questions</Label>
            <h2 style={{ fontSize: "clamp(34px,4vw,56px)", fontWeight: 900, letterSpacing: "-2.5px", marginTop: 16, lineHeight: 1.1 }}>
              Everything you need to <span style={{ color: G }}>know</span>
            </h2>
            <p style={{ color: "#4b5563", fontSize: 19, marginTop: 16, fontWeight: 500 }}>
              Can't find what you are looking for? Reach out to our 24/7 support.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: "16px 36px 16px",
            border: "1px solid rgba(0,0,0,0.04)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.02)",
          }}>
            {faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   CTA — original live website full-bleed solid green layout
───────────────────────────────────────────────────────────────────────── */
export function CTA() {
  return (
    <section style={{ padding: "80px 24px 90px", background: G, position: "relative", zIndex: 1 }} id="contact-us">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
        <Reveal>
          <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", marginBottom: 16, marginTop: 0, lineHeight: 1.15 }}>
            Ready to Automate Your Business?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.95)", fontSize: 17, marginBottom: 36, marginTop: 0, maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6 }}>
            Be one of the first to turn WhatsApp into your smartest revenue channel, fully automated, 24/7.
          </p>
          <div className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <motion.div whileTap={{ scale: 0.96 }}>
              <Link className="btn-anim-white" style={{ background: "#fff", color: G, padding: "16px 36px", borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: "none", display: "inline-block" }} href="/signup">
                Start Your Free Trial →
              </Link>
            </motion.div>
            <motion.div whileTap={{ scale: 0.96 }}>
              <Link className="btn-anim-white" style={{ background: "#fff", color: G, padding: "16px 36px", borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: "none", display: "inline-block" }} href="/support">
                Contact Us
              </Link>
            </motion.div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 20, marginBottom: 0 }}>
            Pay with UPI later · Cancel anytime
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FOOTER — original live website flat black container
───────────────────────────────────────────────────────────────────────── */
export function Footer() {
  return (
    <footer style={{
      background: "#0c0e14",
      padding: "48px 40px",
      color: "#666",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      position: "relative",
      zIndex: 10
    }}>
      <div className="footer-inner" style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
         <Link 
          href="/" 
          onClick={(e) => {
            if (window.location.pathname === "/") {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
              window.history.pushState("", document.title, window.location.pathname);
            }
          }}
          style={{ display: "flex", alignItems: "center", textDecoration: "none" }}
        >
          <img src="/logo.png" alt="Aries AI" style={{ height: 32, filter: "brightness(0) invert(1)" }} />
        </Link>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/privacy" style={{ color: "#aaa", textDecoration: "none", transition: "color 150ms" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}>
            Privacy Policy
          </Link>
          <Link href="/terms" style={{ color: "#aaa", textDecoration: "none", transition: "color 150ms" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}>
            Terms of Service
          </Link>
          <Link href="/security" style={{ color: "#aaa", textDecoration: "none", transition: "color 150ms" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}>
            Security
          </Link>
          <Link href="/data-rights" style={{ color: "#aaa", textDecoration: "none", transition: "color 150ms" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}>
            Data Rights
          </Link>
          <Link href="/support" style={{ color: "#aaa", textDecoration: "none", transition: "color 150ms" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}>
            Support
          </Link>
        </div>
        <p style={{ fontSize: 13, margin: 0, color: "#666" }}>© 2026 Aries AI. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SHOWCASE — product screenshot section                                      
───────────────────────────────────────────────────────────────────────── */
function ShowcaseSection() {
  return (
    <section style={{ background: "#fff", padding: "80px 40px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <Reveal delay={0}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: G, textTransform: "uppercase", marginBottom: 12 }}>
            See It In Action
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 48px)", fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 16, color: "#111", lineHeight: 1.15 }}>
            Turn Every Conversation Into a Sale
          </h2>
        </Reveal>
        <Reveal delay={0.2}>
          <p style={{ fontSize: 17, color: "#666", maxWidth: 520, margin: "0 auto 40px", lineHeight: 1.7 }}>
            From product enquiries to checkout, your AI handles the entire customer journey on WhatsApp, automatically.
          </p>
        </Reveal>
        <Reveal delay={0.3} y={24}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img src="/hero.png" alt="WhatsApp Business Automation in action"
              style={{ width: "100%", maxWidth: 1100, height: "auto", WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)", maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)" }}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUICK START — last.jpeg setup overview                                    
   ───────────────────────────────────────────────────────────────────────── */
export function QuickStartSection() {
  return (
    <section style={{ background: "#f7f8fa", padding: "80px 24px 100px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Reveal delay={0.1} y={24}>
          <div className="quickstart-card">
            
            {/* Left Column: Crisp HTML Text & List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 28, textAlign: "left" }}>
              <div>
                <h2 style={{
                  fontSize: "clamp(26px, 3.2vw, 38px)",
                  fontWeight: 900,
                  color: "#0c0e14",
                  letterSpacing: "-1.5px",
                  lineHeight: 1.15,
                  margin: "0 0 16px 0"
                }}>
                  Get WhatsApp AI Running<br />in Under 10 Minutes
                </h2>
                <p style={{
                  fontSize: 16.5,
                  color: "#4b5563",
                  lineHeight: 1.6,
                  fontWeight: 500,
                  margin: 0,
                  maxWidth: 520
                }}>
                  Aries AI connects directly to WhatsApp Business API with no coding, no third-party tools, and no waiting weeks.
                </p>
              </div>

              {/* Bullet checklist with exact site green */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {[
                  {
                    title: "Direct Meta API Connection",
                    desc: "Your number, your data. No middlemen. Fully compliant with Meta's WhatsApp policies."
                  },
                  {
                    title: "AI Trained on Your Business",
                    desc: "Tell us your services once. AI handles every customer query 24/7 in Hindi, English, or Hinglish."
                  },
                  {
                    title: "Zero Tech Skills Needed",
                    desc: "If you can use WhatsApp, you can set up Aries AI. Step-by-step onboarding included."
                  }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: G,
                      color: "#fff",
                      flexShrink: 0,
                      marginTop: 2,
                      boxShadow: `0 0 10px ${G}33`
                    }}>
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p style={{ fontSize: 14.8, color: "#1f2937", lineHeight: 1.5, margin: 0 }}>
                      <strong style={{ fontWeight: 700 }}>{item.title}</strong>: {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              {/* CTA Button with exact site green */}
              <div>
                <motion.div whileTap={{ scale: 0.97 }} style={{ display: "inline-block" }}>
                  <Link 
                    href="/signup" 
                    className="btn-anim"
                    style={{ 
                      display: "inline-flex", 
                      alignItems: "center",
                      gap: 8,
                      background: G, 
                      color: "#fff", 
                      padding: "14px 28px", 
                      borderRadius: 10, 
                      fontSize: 15, 
                      fontWeight: 800, 
                      textDecoration: "none", 
                      boxShadow: `0 8px 24px ${G}25`
                    }}
                  >
                    Start Free for 14 Days →
                  </Link>
                </motion.div>
              </div>
            </div>

            {/* Right Column: Hand-cropped illustration with exact light green container */}
            <div className="quickstart-mockup">
              <img 
                src="/last_mockup.png" 
                alt="Aries AI Mockup"
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  display: "block",
                  objectFit: "contain"
                }} 
              />
            </div>

          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   EXPORT                                                                    
───────────────────────────────────────────────────────────────────────── */
export default function LandingPageClient() {
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#fff", color: "#111", margin: 0, overflowX: "hidden" }}>
      <style>{CSS}</style>
      <Navbar />
      <Hero />
      <ShowcaseSection />
      <TrustBar />
      <Stats />
      <Features />
      <HowItWorks />
      <Integrations />
      <UseCases />
      <Pricing />
      <QuickStartSection />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
