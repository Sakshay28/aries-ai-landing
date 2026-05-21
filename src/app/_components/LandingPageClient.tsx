"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const G = "#25D366";
const GD = "#128C7E";

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  /* ─── Navbar ─── */
  .nav-inner { padding: 0 40px; height: 68px; display: flex; align-items: center; justify-content: space-between; }
  .nav-links { display: flex; align-items: center; gap: 32px; }
  .nav-actions { display: flex; align-items: center; gap: 16px; }
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

  /* ─── Section padding ─── */
  .section-pad { padding: 64px 40px 100px; }
  .section-pad-sm { padding: 80px 40px; }

  /* ─── Grids ─── */
  .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  .industries-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; }
  .industries-grid:last-of-type { margin-bottom: 0; }
  .pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; max-width: 1280px; margin: 0 auto; }
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
  .pc .pop-badge { opacity: 0; transition: opacity 0.4s; }
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
    .industries-grid { grid-template-columns: repeat(2, 1fr); }
    .hero-grid { grid-template-columns: 1fr; gap: 0; }
    .hero-image-wrap { display: none; }
    .setup-grid { grid-template-columns: 1fr; }
    .setup-image-col { display: none; }
  }

  /* ─── Mobile (≤768px) ─── */
  @media (max-width: 768px) {
    .nav-inner { padding: 0 20px; }
    .nav-links { display: none; }
    .nav-actions { display: none; }
    .hamburger { display: flex; }

    .hero-grid { padding: 80px 20px 40px; min-height: auto; }
    .hero-cta { flex-direction: column; }
    .hero-cta a, .hero-cta-outline { width: 100%; text-align: center; justify-content: center; }

    .section-pad { padding: 48px 20px 64px; }
    .section-pad-sm { padding: 48px 20px; }

    .pricing-grid { grid-template-columns: 1fr; }
    .industries-grid { grid-template-columns: 1fr; }
    .hiw-grid { grid-template-columns: 1fr; gap: 32px; }
    .step-connector { display: none !important; }

    .trust-items { flex-direction: column; align-items: center; gap: 20px; }

    .bold-stats { flex-direction: column; gap: 20px; }

    .cta-buttons { flex-direction: column; align-items: center; }
    .cta-buttons a { width: 100%; max-width: 360px; text-align: center; }

    .footer-inner { flex-direction: column; align-items: flex-start; gap: 20px; }
  }
`;

function Navbar() {
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
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: scrolled ? "rgba(255,255,255,0.97)" : "#fff",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #eee",
        transition: "all 0.3s",
      }}>
        <div className="nav-inner">
          <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: 40 }} />
          </Link>

          {/* Desktop nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
            <div className="nav-links">
              {navItems.map(item => (
                <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`}
                  style={{ color: "#555", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>
                  {item}
                </a>
              ))}
            </div>
            <div className="nav-actions">
              <Link href="/login" className="btn-anim" style={{ background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 80, textAlign: "center" }}>Login</Link>
              <Link href="/signup" className="btn-anim" style={{ background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 140, textAlign: "center" }}>Start Free Trial →</Link>
            </div>
          </div>

          {/* Hamburger */}
          <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            <span style={{ transform: menuOpen ? "rotate(45deg) translate(5px, 5px)" : "none" }} />
            <span style={{ opacity: menuOpen ? 0 : 1 }} />
            <span style={{ transform: menuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none" }} />
          </button>
        </div>
      </nav>

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

function Hero() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #f0fdf4 0%, #fff 50%, #f0fdf4 100%)", paddingTop: 80 }}>
      <div className="hero-grid">
        <div>
          <h1 style={{ fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-2px", marginBottom: 20 }}>
            Automate Your<br />
            <span style={{ color: G }}>WhatsApp Business</span><br />
            With AI
          </h1>
          <p style={{ fontSize: 18, color: "#555", lineHeight: 1.7, marginBottom: 36, maxWidth: 480 }}>
            Your AI assistant replies to customer enquiries, takes bookings, captures leads, and follows up — 24/7. While you sleep.
          </p>
          <div className="hero-cta">
            <Link href="/signup" className="btn-anim" style={{ background: G, color: "#fff", padding: "16px 32px", borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
              Start Free 14-Day Trial →
            </Link>
            <a href="#how-it-works" className="btn-anim-outline hero-cta-outline" style={{ background: "#fff", color: "#111", padding: "16px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid #ddd", textAlign: "center" }}>
              See How It Works
            </a>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {["Free 14-day trial", "Pay with UPI later", "Setup in under 10 minutes"].map(t => (
              <span key={t} style={{ fontSize: 13, color: "#777", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, display: "inline-block", flexShrink: 0 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-image-wrap" style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          <img
            src="/page.png"
            alt="WhatsApp AI automation in action"
            style={{
              width: "100%", maxWidth: 960,
              transform: "scale(1.3) translateX(100px)",
              transformOrigin: "center right",
              height: "auto", position: "relative", zIndex: 1,
              WebkitMaskImage: "radial-gradient(ellipse 80% 80% at center, black 50%, transparent 100%)",
              maskImage: "radial-gradient(ellipse 80% 80% at center, black 50%, transparent 100%)",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  return (
    <section style={{ background: "#fff", padding: "80px 40px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: G, textTransform: "uppercase", marginBottom: 12 }}>
          See It In Action
        </p>
        <h2 style={{ fontSize: "clamp(26px, 3.5vw, 48px)", fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 16, color: "#111", lineHeight: 1.15 }}>
          Turn Every Conversation Into a Sale
        </h2>
        <p style={{ fontSize: 17, color: "#666", maxWidth: 520, margin: "0 auto 40px", lineHeight: 1.7 }}>
          From product enquiries to checkout — your AI handles the entire customer journey on WhatsApp, automatically.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img src="/hero.png" alt="WhatsApp Business Automation in action"
            style={{ width: "100%", maxWidth: 1100, height: "auto", WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)", maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)" }}
          />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const items = [
    { icon: "🛡️", title: "Official Meta API", desc: "Direct WhatsApp Cloud API integration" },
    { icon: "🇮🇳", title: "Built in India", desc: "Designed for Indian businesses & languages" },
    { icon: "🔐", title: "Bank-Grade Security", desc: "AES-256 encryption & RLS isolation" },
    { icon: "🎁", title: "14-Day Free Trial", desc: "No credit card required to start" },
  ];
  return (
    <section style={{ background: "#111", padding: "40px 20px" }}>
      <div className="trust-items" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24 }}>
        {items.map(s => (
          <div key={s.title} style={{ textAlign: "center", maxWidth: 220 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: G }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4, lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BoldStatement() {
  return (
    <section style={{ padding: "80px 20px", background: "linear-gradient(180deg, #ffffff 0%, #f0fdf4 50%, #ffffff 100%)", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(37,211,102,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 860, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <span style={{ display: "inline-block", background: "#dcfce7", color: GD, padding: "6px 18px", borderRadius: 100, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 28 }}>What Makes Us Different</span>
        <h2 style={{ fontSize: "clamp(32px, 5.5vw, 72px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", color: "#0a0a0a", margin: "0 0 24px" }}>
          The AI that knows{" "}
          <span style={{ color: G }}>your business</span>
          <br />
          <span style={{ color: "#555", fontWeight: 800 }}>better than your staff.</span>
        </h2>
        <p style={{ fontSize: "clamp(15px, 1.8vw, 20px)", color: "#666", lineHeight: 1.7, maxWidth: 600, margin: "0 auto 48px" }}>
          Every business is unique. Aries AI learns your menu, your prices, your FAQs, your tone — and answers like a trained member of your team. 24/7.
        </p>
        <div className="bold-stats" style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
          {[{ n: "3 min", label: "Average setup time" }, { n: "24/7", label: "Always on, never sleeps" }, { n: "11+", label: "Indian languages supported" }].map(({ n, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 900, color: G, letterSpacing: "-1px" }}>{n}</div>
              <div style={{ fontSize: 14, color: "#888", marginTop: 4, fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const feats = [
    { icon: "🧠", title: "AI That Truly Understands", desc: "Not a rigid chatbot. Real AI that gets 'bhai kal 4 baje table milega?' in Hindi, English, or Hinglish.", color: "#8B5CF6" },
    { icon: "📲", title: "Direct WhatsApp API", desc: "Official Meta WhatsApp Cloud API. Your number, your conversations. No third-party restrictions.", color: G },
    { icon: "📊", title: "Smart Lead Pipeline", desc: "Every chat is automatically scored. See hot, warm, cold leads. Never miss a booking.", color: "#F59E0B" },
    { icon: "⏰", title: "Auto Follow-Ups", desc: "AI sends follow-up messages at the right time. 30 min, 3 hours, 24 hours — all configurable.", color: "#EC4899" },
    { icon: "📋", title: "Google Sheets Sync", desc: "Every lead instantly appears in a Google Sheet. Share with your team. No dashboard needed.", color: "#10B981" },
    { icon: "🔔", title: "Instant Staff Alerts", desc: "Hot lead comes in? Your staff gets a WhatsApp ping. Escalation? Manager notified instantly.", color: "#3B82F6" },
  ];
  return (
    <section id="features" className="section-pad" style={{ background: "#f8fafb", scrollMarginTop: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>Features</span>
          <h2 style={{ fontSize: "clamp(26px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Everything You Need to <span style={{ color: G }}>Close More Leads</span>
          </h2>
          <p style={{ color: "#777", fontSize: 16, marginTop: 12, maxWidth: 540, margin: "12px auto 0" }}>
            Built for restaurants, salons, clinics, real estate agents, and any business getting WhatsApp enquiries.
          </p>
        </div>
        <div className="features-grid">
          {feats.map(f => (
            <div key={f.title} style={{ background: "#fff", borderRadius: 16, padding: 28, border: "1px solid #eee", transition: "box-shadow 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${f.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: "#777", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Industries() {
  const list = [
    { title: "E-Commerce & Retail", desc: "Automate abandoned cart recovery, send order updates, handle product inquiries and COD confirmations instantly.", color: "#10B981", bg: "#F0FDF4" },
    { title: "Real Estate", desc: "Qualify high-intent buyers automatically, answer property queries and schedule site visits 24/7 without any manual effort.", color: "#3B82F6", bg: "#EFF6FF" },
    { title: "Healthcare & Clinics", desc: "Manage appointment bookings, send automated reminders, handle patient FAQs and follow-ups seamlessly.", color: "#8B5CF6", bg: "#F5F3FF" },
    { title: "Travel & Hospitality", desc: "Handle booking inquiries, share custom itineraries, send trip reminders and upsell premium packages instantly.", color: "#EC4899", bg: "#FDF2F8" },
    { title: "Cafes & Restaurants", desc: "Accept table reservations, send daily menu updates, run loyalty offers and handle customer queries on WhatsApp.", color: "#D97706", bg: "#FFFBEB" },
    { title: "Clubs & Nightlife", desc: "Send event announcements, manage guest list confirmations, promote exclusive offers and handle entry queries automatically.", color: "#EF4444", bg: "#FEF2F2" },
  ];
  return (
    <section id="use-cases" className="section-pad" style={{ background: "#F7F8FA", scrollMarginTop: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 800, letterSpacing: "-1.5px", color: "#1a1a1a", margin: "0 0 16px" }}>
            Built for <span style={{ color: G }}>Modern Businesses</span>
          </h2>
          <p style={{ fontSize: 17, color: "#6B7280", maxWidth: 580, margin: "0 auto", lineHeight: 1.65 }}>
            Whatever your industry, Aries AI adapts to your unique workflows to turn conversations into revenue.
          </p>
        </div>
        <div className="industries-grid">
          {list.slice(0, 3).map(i => (
            <div key={i.title} className="uc-card" style={{ background: "#fff", borderRadius: 16, padding: "24px 24px 24px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${i.color}`, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: i.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: i.color, opacity: 0.85 }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>{i.title}</h3>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65, margin: 0 }}>{i.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="industries-grid" style={{ marginTop: 20 }}>
          {list.slice(3, 6).map(i => (
            <div key={i.title} className="uc-card" style={{ background: "#fff", borderRadius: 16, padding: "24px 24px 24px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${i.color}`, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: i.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: i.color, opacity: 0.85 }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>{i.title}</h3>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65, margin: 0 }}>{i.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", icon: "📱", title: "Connect WhatsApp", desc: "Link your WhatsApp Business number. Takes 5 minutes with step-by-step guidance." },
    { n: "2", icon: "🤖", title: "Configure Your AI Bot", desc: "Tell us your business name, type, and services. AI learns your business instantly." },
    { n: "3", icon: "🚀", title: "Go Live & Watch Leads Flow", desc: "Your AI starts replying to customers 24/7. You track everything in real-time." },
  ];
  return (
    <section id="how-it-works" className="section-pad" style={{ background: "#f8fafb", scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>How It Works</span>
          <h2 style={{ fontSize: "clamp(26px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Live in <span style={{ color: G }}>Under 5 Minutes</span>
          </h2>
        </div>
        <div className="hiw-grid">
          {steps.map((step, i) => (
            <div key={i} style={{ textAlign: "center", position: "relative" }}>
              {i < steps.length - 1 && (
                <div className="step-connector" style={{ position: "absolute", top: 32, left: "calc(50% + 60px)", width: "calc(100% - 120px)", height: 2, background: "linear-gradient(to right, #25D366, #dcfce7)" }} />
              )}
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: G, color: "#fff", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 8px 24px rgba(37,211,102,0.35)" }}>
                {step.icon}
              </div>
              <div style={{ display: "inline-block", background: "#dcfce7", color: GD, borderRadius: 100, padding: "2px 12px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>STEP {step.n}</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{step.title}</h3>
              <p style={{ color: "#777", fontSize: 14, lineHeight: 1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SetupSection() {
  const points = [
    { icon: "✓", title: "Direct Meta API Connection", desc: "Your number, your data. No middlemen, no delays. Fully compliant with Meta's official WhatsApp policies." },
    { icon: "✓", title: "AI Trained on Your Business", desc: "Tell us your services once. Aries AI handles every customer query 24/7 in Hindi, English, or Hinglish." },
    { icon: "✓", title: "Zero Tech Skills Needed", desc: "If you can use WhatsApp, you can set up Aries AI. Step-by-step onboarding gets you live in minutes." },
  ];
  return (
    <section className="section-pad-sm" style={{ background: "#fff" }}>
      <div className="setup-grid">
        <div>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 48px)", fontWeight: 900, color: "#1a1a1a", lineHeight: 1.15, letterSpacing: "-1px", marginBottom: 16 }}>
            Get WhatsApp AI Running in{" "}
            <span style={{ color: G }}>Under 10 Minutes</span>
          </h2>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.65, marginBottom: 36, maxWidth: 420 }}>
            Aries AI connects directly to WhatsApp Business API — no coding, no third-party tools, no waiting.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {points.map(p => (
              <div key={p.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0, marginTop: 2 }}>
                  {p.icon}
                </div>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>{p.title}</h4>
                  <p style={{ fontSize: 14, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/signup" className="btn-anim" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 36, background: G, color: "#fff", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            Start Free for 14 Days →
          </Link>
        </div>
        <div className="setup-image-col" style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: "-20px -20px -20px 20px", background: "#f0fdf4", borderRadius: 24, zIndex: 0 }} />
          <img src="/setup-mockup.png" alt="Aries AI Setup Mockup"
            style={{ width: "100%", height: "auto", objectFit: "contain", position: "relative", zIndex: 1, borderRadius: 16, filter: "drop-shadow(0 24px 48px rgba(0,0,0,0.12))" }}
          />
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const plans = [
    {
      name: "Starter", price: "1,499", period: "/month", oldPrice: "2,000",
      desc: "For single location or small businesses starting with WhatsApp marketing",
      caps: ["1 Agent Seat included", "2,000 conversations/month"],
      features: ["Free WhatsApp Business API Connection", "Free Blue Tick Application", "₹100 Free Conversation Credits", "Unlimited Free Service Conversations", "Manual Live Chat Inbox", "Create Template Messages", "Broadcast Campaigns & Scheduler", "Upload & Manage Contacts (up to 10 tags)"],
      cta: "Start Free Trial", popular: false,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null as null,
    },
    {
      name: "Growth", price: "2,990", period: "/month", oldPrice: "3,999",
      desc: "Scale your customer support with AI FAQ automation",
      caps: ["2 Agent Seats included (simultaneous login)", "10,000 conversations/month"],
      features: ["Everything in Starter, plus:", "AI Chatbot FAQ Automator (1 Active Bot)", "Chatbot trained on website & custom FAQs", "Multi-lingual responses (Hindi, English, Hinglish)", "Smart User Attributes & Custom Segments", "Priority Email Support"],
      cta: "Start Free Trial", popular: false,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null as null,
    },
    {
      name: "Pro", price: "4,999", period: "/month", oldPrice: "5,999",
      desc: "Advanced interactive workflows and flow builders",
      caps: ["5 Agent Seats included", "25,000 conversations/month"],
      features: ["Everything in Growth, plus:", "Visual WhatsApp Chatbot Flow Builder", "Up to 5 Active WhatsApp Chatbot Flows", "Google Sheets Live Sync", "Automatic Lead Scoring & Escalation Alerts", "Multi-Agent Routing & Chat Transfer", "CRM Integrations (Shopify, HubSpot, Salesforce)", "Priority WhatsApp & Email Support"],
      cta: "Start Free Trial", popular: true,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null as null,
    },
    {
      name: "Ultra Premium", price: "Custom", period: "", oldPrice: "",
      desc: "AI Voice Calling + Custom integrations for high-volume brands",
      caps: ["Custom Agent Seats", "Unlimited conversations"],
      features: ["Everything in Pro, plus:", "Dedicated Custom LLM training & fine-tuning", "Custom system integrations & database sync", "White-label analytics reports & client portals", "🔥 AI Voice Calling for Booking Confirmation", "150 AI Voice Calls Included", "Auto WhatsApp Fallback on Missed Calls", "Dedicated Account Manager & SLA (under 1 hour)"],
      cta: "Contact Sales", popular: false,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: { included: 150, addon: "₹15/call after 150 calls", topup: "₹999 for 100 extra calls" } as { included: number; addon: string; topup: string },
    },
  ];

  const getPrice = (price: string) => {
    if (price === "Custom") return "Custom";
    if (price === "0") return "0";
    const num = parseInt(price.replace(",", ""));
    if (isNaN(num)) return price;
    if (billing === "annual") return Math.round(num * 0.8).toLocaleString("en-IN");
    return price;
  };

  return (
    <section id="pricing" className="section-pad" style={{ background: "#fff", scrollMarginTop: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>Pricing</span>
          <h2 style={{ fontSize: "clamp(26px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Simple, <span style={{ color: G }}>Transparent</span> Pricing
          </h2>
          <p style={{ color: "#999", fontSize: 15, marginTop: 12 }}>No hidden charges. Pay only for what you use. All plans include WhatsApp Business API.</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 40 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: billing === "monthly" ? "#111" : "#999", cursor: "pointer" }} onClick={() => setBilling("monthly")}>Monthly</span>
          <button className={`t-switch${billing === "annual" ? " on" : ""}`} onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")} aria-label="Toggle billing cycle">
            <span className="t-thumb" />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: billing === "annual" ? "#111" : "#999", cursor: "pointer" }} onClick={() => setBilling("annual")}>
            Annual <span className="save-tag">Save 20%</span>
          </span>
        </div>

        <div className="pricing-grid">
          {plans.map(plan => (
            <div key={plan.name} className="pc">
              {plan.popular && (
                <div className="pop-badge" style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: G, color: "#fff", padding: "5px 20px", borderRadius: 100, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.5px" }}>
                  MOST POPULAR
                </div>
              )}
              <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: "inherit" }}>{plan.name}</h3>
              <p className="pd" style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{plan.desc}</p>
              <div style={{ marginBottom: 20 }}>
                {plan.oldPrice && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span className="po" style={{ fontSize: 15, textDecoration: "line-through" }}>₹{plan.oldPrice}</span>
                    <span style={{ background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100 }}>
                      {Math.round((1 - parseInt(plan.price.replace(",", "")) / parseInt(plan.oldPrice.replace(",", ""))) * 100)}% OFF
                    </span>
                  </div>
                )}
                {plan.price !== "Custom" && <span className="ps" style={{ fontSize: 15 }}>₹</span>}
                <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-2px", color: "inherit" }}>{getPrice(plan.price)}</span>
                {plan.price !== "Custom" && <span className="ps" style={{ fontSize: 14 }}> {plan.period}</span>}
                {billing === "annual" && plan.price !== "0" && plan.price !== "Custom" && (
                  <div style={{ fontSize: 12, color: G, fontWeight: 600, marginTop: 4 }}>Billed annually</div>
                )}
              </div>
              <Link href={plan.price === "Custom" ? "#contact-us" : "/signup"} className="pb">{plan.cta}</Link>
              <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "20px 0 16px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {plan.caps.map(cap => (
                  <div key={cap} className="cap-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12 }}>📊</span> {cap}
                  </div>
                ))}
              </div>
              <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "0 0 16px" }} />
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, padding: 0, margin: 0 }}>
                {plan.features.map(f => (
                  <li key={f} className={f.startsWith("🔥") ? "pf pf-highlight" : "pf"} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <span style={{ color: G, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              {plan.voiceCalls && (
                <div className="voice-box">
                  <div className="voice-title">📞 AI Voice Call Add-On</div>
                  <div className="voice-detail">• {plan.voiceCalls.included} calls included free</div>
                  <div className="voice-detail">• {plan.voiceCalls.addon}</div>
                  <div className="voice-detail">• Top-up: {plan.voiceCalls.topup}</div>
                </div>
              )}
              <div className="tmpl-section">
                <div className="tmpl-title">Per Template Message Charges</div>
                <div className="tmpl-item"><span style={{ color: G, fontWeight: 700 }}>✓</span> Marketing: <strong>{plan.templateCharges.marketing}</strong></div>
                <div className="tmpl-item"><span style={{ color: G, fontWeight: 700 }}>✓</span> Utility: <strong>{plan.templateCharges.utility}</strong></div>
                <div className="tmpl-item"><span style={{ color: G, fontWeight: 700 }}>✓</span> Authentication: <strong>{plan.templateCharges.auth}</strong></div>
                <div className="tmpl-item"><span style={{ color: G, fontWeight: 700 }}>✓</span> Service: <strong>{plan.templateCharges.service}</strong></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 28, flexWrap: "wrap", paddingTop: 40 }}>
          {["🔒 Secure Payments", "📱 Cancel Anytime", "💬 14-Day Free Trial on Paid Plans", "🇮🇳 UPI, Cards & Net Banking"].map(t => (
            <span key={t} style={{ fontSize: 13, color: "#999", fontWeight: 500 }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section style={{ padding: "72px 24px", background: G }}>
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(26px,3vw,44px)", fontWeight: 900, color: "#fff", letterSpacing: "-1px", marginBottom: 16 }}>
          Ready to Automate Your Business?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 17, marginBottom: 32 }}>
          Be one of the first to turn WhatsApp into your smartest revenue channel — fully automated, 24/7.
        </p>
        <div className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn-anim-white" style={{ background: "#fff", color: G, padding: "16px 36px", borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: "none", display: "inline-block" }}>
            Start Your Free Trial →
          </Link>
          <a href="#contact-us" className="btn-anim-white" style={{ background: "#fff", color: G, padding: "16px 36px", borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: "none", display: "inline-block" }}>
            Contact Us
          </a>
        </div>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 16 }}>Pay with UPI later · Cancel anytime</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact-us" style={{ background: "#111", padding: "40px 24px", color: "#aaa" }}>
      <div className="footer-inner" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
        <img src="/logo.png" alt="Aries AI" style={{ height: 32, filter: "brightness(0) invert(1)" }} />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          {["Privacy Policy", "Terms of Service", "Support"].map(l => (
            <a key={l} href="#" style={{ color: "#aaa", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 13, margin: 0 }}>© 2026 Aries AI. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function LandingPageClient() {
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#fff", color: "#111", margin: 0 }}>
      <style>{GLOBAL_CSS}</style>
      <Navbar />
      <Hero />
      <ShowcaseSection />
      <TrustBar />
      <BoldStatement />
      <Features />
      <Industries />
      <HowItWorks />
      <SetupSection />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}
