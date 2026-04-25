"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/* ═══ NAVBAR ═══ */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
      <Link href="/" className="lp-nav-logo">
        <img src="/logo.png" alt="Aries AI" style={{ height: 40 }} />
      </Link>
      <div className="lp-nav-links">
        <a href="#features" className="lp-nav-link">Features</a>
        <a href="#how-it-works" className="lp-nav-link" onClick={(e) => {
          e.preventDefault();
          document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
        }}>How It Works</a>
        <a href="#pricing" className="lp-nav-link">Pricing</a>
        <Link href="/login" className="lp-nav-link">Login</Link>
        <Link href="/signup" className="lp-nav-cta">Start Free Trial</Link>
      </div>
    </nav>
  );
}

/* ═══ SCROLL PROGRESS ═══ */
export function ScrollProgress({ progress }: { progress: number }) {
  return (
    <div className="scroll-progress">
      <div className="scroll-progress-bar" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

/* ═══ PHASE DOTS ═══ */
const phases = ["Intro", "Leads", "AI", "Workflows", "Revenue", "CTA"];
export function PhaseDots({ activePhase }: { activePhase: number }) {
  return (
    <div className="phase-dots">
      {phases.map((_, i) => (
        <button key={i} className={`phase-dot${activePhase === i ? " active" : ""}`} aria-label={phases[i]} />
      ))}
    </div>
  );
}

/* ═══ WHATSAPP PHONE MOCKUP (CSS-only, like AiSensy) ═══ */
function PhoneMockup() {
  return (
    <div className="phone-mockup">
      {/* Phone frame */}
      <div className="phone-frame">
        {/* Status bar */}
        <div className="phone-status">
          <span>9:41</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10 }}>●●●●</span>
            <span style={{ fontSize: 10 }}>▐</span>
          </div>
        </div>
        {/* WhatsApp header */}
        <div className="wa-header">
          <span style={{ fontSize: 14 }}>←</span>
          <div className="wa-avatar">S</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>StepOut Official ✓</div>
            <div style={{ fontSize: 11, color: "#90CAF9" }}>online</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 16 }}>📞 📹 ⋮</div>
        </div>
        {/* Chat messages */}
        <div className="wa-chat">
          <div className="wa-msg wa-msg-in">Is this available in size 9?</div>
          <div className="wa-msg wa-msg-out">
            <div className="wa-ai-tag">🤖 AI Response</div>
            Hey Arjun! 👋<br />
            Yes, size 9 is in stock. Order now and get 15% OFF — today only!
          </div>
          <div className="wa-msg wa-msg-out">
            <div className="wa-shop-btn">Shop Now</div>
            <div style={{ textAlign: "right", fontSize: 12, color: "#666", marginTop: 6 }}>₹1,299.00</div>
          </div>
          <div className="wa-msg wa-msg-in" style={{ background: "#dcfce7" }}>
            ✅ Order Placed
          </div>
        </div>
      </div>
      {/* Floating badges around phone */}
      <div className="phone-badge badge-roas">
        <span style={{ fontSize: 24, fontWeight: 900, color: "#25D366" }}>8X</span>
        <span style={{ fontSize: 11, color: "#666" }}>ROAS</span>
      </div>
      <div className="phone-badge badge-read">
        <span style={{ fontSize: 11, color: "#25D366", fontWeight: 700 }}>✓✓ 89% Read Rate</span>
      </div>
      {/* Instagram ad card */}
      <div className="phone-badge badge-ad">
        <div style={{ fontSize: 10, color: "#999", marginBottom: 4 }}>📷 Meta · Sponsored</div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>StepOut Shoes</div>
        <div className="wa-shop-btn" style={{ fontSize: 11, padding: "4px 10px" }}>Chat on WhatsApp</div>
      </div>
    </div>
  );
}

/* ═══ HERO SCENE ═══ */
export function HeroScene({ opacity }: { opacity: number }) {
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <section className="hero-section">
        <div className="hero-grid">
          <div>
            <h1 className="hero-title">
              Never Miss a<br />
              <span className="green">WhatsApp Lead</span>
            </h1>
            <p className="hero-sub">
              Respond to every customer instantly. Capture leads, send broadcasts, and close deals — all through WhatsApp, without lifting a finger.
            </p>
            <div className="hero-ctas">
              <Link href="/signup" className="btn-primary">
                Start 14-Day FREE Trial
              </Link>
              <a href="#how-it-works" className="btn-secondary"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                See How It Works
              </a>
            </div>
            <div className="hero-trust">
              <span>Free 14-day trial</span>
              <span>Pay with UPI later</span>
              <span>Setup in under 10 minutes</span>
            </div>
          </div>
          <PhoneMockup />
        </div>
      </section>
    </div>
  );
}

/* ═══ INCOMING LEADS SCENE ═══ */
export function IncomingScene({ opacity, progress }: { opacity: number; progress: number }) {
  const bubbles = [
    { text: "Hi, I saw your ad on Instagram! 📱", x: "10%", y: "22%", delay: 0 },
    { text: "Is this still available?", x: "62%", y: "16%", delay: 0.15 },
    { text: "I want to book for tomorrow", x: "6%", y: "52%", delay: 0.3 },
    { text: "What's the price? 💰", x: "56%", y: "42%", delay: 0.45 },
    { text: "Can you send the catalog?", x: "18%", y: "72%", delay: 0.6 },
    { text: "Hello? Anyone there? 😤", x: "68%", y: "68%", delay: 0.75 },
  ];
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <div className="scene-bg-gradient" />
      <div className="scene-header">
        <div className="section-badge">⚠️ The Problem</div>
        <h2 className="section-title">Leads Are <span className="green">Flooding In</span></h2>
        <p className="section-sub">Hundreds of messages. Zero automation. Revenue slipping through the cracks.</p>
      </div>
      {bubbles.map((b, i) => {
        const show = progress > b.delay;
        const o = show ? Math.min(1, (progress - b.delay) * 4) : 0;
        return (
          <div key={i} className="chat-bubble incoming" style={{
            position: "absolute", left: b.x, top: b.y, opacity: o, zIndex: 2,
            transform: `translateY(${show ? 0 : 20}px)`, transition: "opacity 0.3s, transform 0.3s",
          }}>{b.text}</div>
        );
      })}
      <div style={{
        position: "absolute", bottom: "12%", left: "50%", transform: "translateX(-50%)",
        textAlign: "center", zIndex: 2,
      }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: "#FF6B6B", letterSpacing: -2 }}>
          {Math.round(progress * 247)}+
        </div>
        <div style={{ color: "#999", fontSize: 14, fontWeight: 600 }}>Unread Messages</div>
      </div>
    </div>
  );
}

/* ═══ AI SCENE ═══ */
export function AIScene({ opacity, progress }: { opacity: number; progress: number }) {
  const items = [
    { q: "Is this available?", a: "Yes! It's in stock. Here's a direct link to order 🛒", delay: 0 },
    { q: "What's the price?", a: "₹1,299 with 15% OFF today only! Use code STEP15 💰", delay: 0.3 },
    { q: "Book for tomorrow", a: "Done! ✅ Booking confirmed for tomorrow at 4 PM.", delay: 0.6 },
  ];
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <div className="scene-bg-gradient" />
      <div className="scene-header">
        <div className="section-badge">🧠 AI Intelligence</div>
        <h2 className="section-title">AI <span className="green">Takes Over</span></h2>
        <p className="section-sub">Every message instantly classified, prioritized, and answered.</p>
      </div>
      <div style={{
        position: "absolute", top: "28%", left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", gap: 20, width: "min(90vw, 460px)", zIndex: 2,
      }}>
        {items.map((r, i) => {
          const show = progress > r.delay;
          const o = show ? Math.min(1, (progress - r.delay) * 3) : 0;
          return (
            <div key={i} style={{ opacity: o, transition: "opacity 0.4s", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="chat-bubble incoming" style={{ alignSelf: "flex-end", borderRadius: "14px 14px 4px 14px" }}>{r.q}</div>
              <div className="chat-bubble ai" style={{ alignSelf: "flex-start", opacity: o > 0.5 ? 1 : 0, transition: "opacity 0.3s 0.2s" }}>
                <span style={{ fontSize: 10, display: "block", marginBottom: 2, color: "#8B5CF6", fontWeight: 700 }}>🤖 AI Response</span>
                {r.a}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 10,
        background: "#f3e8ff", border: "1px solid #e9d5ff",
        borderRadius: 100, padding: "8px 20px", zIndex: 2,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6" }} />
        <span style={{ color: "#7C3AED", fontSize: 13, fontWeight: 600 }}>
          AI processing {Math.round(progress * 100)}% of conversations
        </span>
      </div>
    </div>
  );
}

/* ═══ WORKFLOW SCENE ═══ */
export function WorkflowScene({ opacity, progress }: { opacity: number; progress: number }) {
  const nodes = [
    { icon: "📩", label: "Lead Captured", x: "50%", y: "22%", delay: 0 },
    { icon: "🤖", label: "AI Responds", x: "25%", y: "38%", delay: 0.15 },
    { icon: "📋", label: "CRM Updated", x: "75%", y: "38%", delay: 0.25 },
    { icon: "⏰", label: "Follow-up Set", x: "20%", y: "56%", delay: 0.4 },
    { icon: "💳", label: "Payment Collected", x: "80%", y: "56%", delay: 0.5 },
    { icon: "🔔", label: "Team Notified", x: "50%", y: "72%", delay: 0.65 },
  ];
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <div className="scene-bg-gradient" />
      <div className="scene-header">
        <div className="section-badge">⚙️ Automation</div>
        <h2 className="section-title">Workflows <span className="green">Activate</span></h2>
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
        <line x1="50%" y1="26%" x2="25%" y2="38%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="50%" y1="26%" x2="75%" y2="38%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="25%" y1="42%" x2="20%" y2="56%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="75%" y1="42%" x2="80%" y2="56%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="20%" y1="60%" x2="50%" y2="72%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
        <line x1="80%" y1="60%" x2="50%" y2="72%" stroke="#bbf7d0" strokeWidth="1.5" strokeDasharray="6 4" />
      </svg>
      {nodes.map((n, i) => {
        const show = progress > n.delay;
        const o = show ? Math.min(1, (progress - n.delay) * 4) : 0;
        return (
          <div key={i} className="workflow-node" style={{
            position: "absolute", left: n.x, top: n.y,
            transform: `translate(-50%,-50%) scale(${show ? 1 : 0.85})`,
            opacity: o, transition: "all 0.3s",
          }}>
            <div className="dot" />
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            {n.label}
          </div>
        );
      })}
    </div>
  );
}

/* ═══ REVENUE SCENE ═══ */
export function RevenueScene({ opacity, progress }: { opacity: number; progress: number }) {
  const metrics = [
    { label: "Leads Captured", value: 2847, suffix: "", color: "#25D366" },
    { label: "Auto-Responses", value: 98, suffix: "%", color: "#8B5CF6" },
    { label: "Revenue Generated", value: 12.4, suffix: "L", prefix: "₹", color: "#25D366" },
    { label: "Time Saved", value: 120, suffix: "hrs", color: "#3B82F6" },
  ];
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <div className="scene-bg-gradient" />
      <div className="scene-header">
        <div className="section-badge" style={{ background: "#dcfce7", borderColor: "#bbf7d0" }}>🚀 Results</div>
        <h2 className="section-title">Revenue Engine: <span className="green">Online</span></h2>
        <p className="section-sub">Watch leads transform into paying customers automatically.</p>
      </div>
      <div style={{
        position: "absolute", top: "35%", left: "50%", transform: "translateX(-50%)",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        width: "min(90vw, 520px)", zIndex: 2,
      }}>
        {metrics.map((m, i) => {
          const show = progress > i * 0.2;
          const o = show ? Math.min(1, (progress - i * 0.2) * 3) : 0;
          const val = show ? m.value * Math.min(1, (progress - i * 0.2) * 2) : 0;
          return (
            <div key={i} className="float-card" style={{
              position: "relative", opacity: o, textAlign: "center", padding: "24px 16px",
              transform: `translateY(${show ? 0 : 15}px)`, transition: "all 0.3s",
            }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: m.color, letterSpacing: -2, marginBottom: 4 }}>
                {m.prefix || ""}{m.suffix === "%" || m.suffix === "L" ? val.toFixed(1) : Math.round(val)}{m.suffix}
              </div>
              <div style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>{m.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: "absolute", bottom: "12%", left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 16, zIndex: 2,
        opacity: progress > 0.7 ? 1 : 0, transition: "opacity 0.4s",
      }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: "#25D366", letterSpacing: -3 }}>5X</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>Revenue Growth</div>
          <div style={{ fontSize: 14, color: "#999" }}>Average across 210,000+ businesses</div>
        </div>
      </div>
    </div>
  );
}

/* ═══ CTA SCENE ═══ */
export function CTAScene({ opacity }: { opacity: number }) {
  return (
    <div className={`scene${opacity > 0.1 ? " active" : ""}`} style={{ opacity }}>
      <div className="scene-bg-gradient" />
      <div style={{
        textAlign: "center", maxWidth: 700, padding: "0 24px",
        display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2,
      }}>
        <div className="section-badge">🎯 Get Started</div>
        <h2 className="section-title" style={{ fontSize: "clamp(32px,5vw,52px)", marginBottom: 20 }}>
          Ready to <span className="green">Automate</span>?
        </h2>
        <p className="section-sub" style={{ marginBottom: 36 }}>
          Join 210,000+ businesses that turned WhatsApp into their #1 revenue channel.
        </p>
        <div className="hero-ctas">
          <Link href="/signup" className="btn-primary">Start 14-Day Free Trial →</Link>
          <a href="#" className="btn-secondary">Book a Demo</a>
        </div>
        <p style={{ color: "#999", fontSize: 13, marginTop: 20 }}>Pay with UPI later · Cancel anytime</p>
      </div>
    </div>
  );
}

/* ═══ HOW IT WORKS ═══ */
export function HowItWorks() {
  const steps = [
    { n: "1", icon: "📱", title: "Connect WhatsApp", desc: "Link your WhatsApp Business number in 5 minutes with step-by-step guidance." },
    { n: "2", icon: "🤖", title: "Configure Your AI Bot", desc: "Tell us your business type and services. AI learns your business instantly." },
    { n: "3", icon: "🚀", title: "Go Live & Watch Leads", desc: "Your AI starts replying to customers 24/7. Track everything in real-time." },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <section className="how-section" id="how-it-works" ref={ref}>
      <div className="features-header">
        <div className="section-badge">How It Works</div>
        <h2 className="section-title">Live in <span className="green">Under 5 Minutes</span></h2>
      </div>
      <div className="how-grid">
        {steps.map((step, i) => (
          <div key={i} className="how-step" style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: `all 0.5s ${i * 0.15}s`,
          }}>
            <div className="how-step-icon">{step.icon}</div>
            <div className="how-step-badge">STEP {step.n}</div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══ FEATURES SECTION ═══ */
export function FeaturesSection() {
  const feats = [
    { icon: "📢", title: "Smart Broadcasting", desc: "Send promotions, offers & carousels to unlimited contacts with 98% open rates." },
    { icon: "🤖", title: "AI Chatbots", desc: "Drag & drop flow builder. Build conversational journeys in minutes." },
    { icon: "📱", title: "Click-to-WhatsApp Ads", desc: "Run Facebook & Instagram ads that land directly on WhatsApp. 5X lead gen." },
    { icon: "📊", title: "CRM & Analytics", desc: "Real-time campaign tracking. Monitor read, reply & click rates." },
    { icon: "💳", title: "In-Chat Payments", desc: "Collect payments within WhatsApp via UPI, cards, and payment gateways." },
    { icon: "👥", title: "Multi-Agent Live Chat", desc: "Multiple team members on the same WhatsApp number with smart routing." },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <section className="features-section" id="features" ref={ref}>
      <div className="features-header">
        <div className="section-badge">✨ Features</div>
        <h2 className="section-title">Everything to <span className="green">Close More Leads</span></h2>
        <p className="section-sub">Built for businesses getting WhatsApp & Instagram enquiries.</p>
      </div>
      <div className="features-grid">
        {feats.map((f, i) => (
          <div key={f.title} className="feature-card" style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: `all 0.5s ${i * 0.08}s`,
          }}>
            <div className="feature-icon">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══ STATS BAR ═══ */
export function StatsBar() {
  const stats = [
    { n: "210K+", l: "Businesses" },
    { n: "68+", l: "Countries" },
    { n: "98%", l: "Open Rate" },
    { n: "5X", l: "Revenue Growth" },
  ];
  return (
    <div className="stats-row">
      {stats.map(s => (
        <div key={s.l} className="stat-item">
          <div className="stat-number">{s.n}</div>
          <div className="stat-label">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══ FOOTER ═══ */
export function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 36, filter: "brightness(0) invert(1)" }} />
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 13 }}>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Support</a>
        </div>
        <p style={{ fontSize: 13, margin: 0 }}>© 2026 Aries AI. All rights reserved.</p>
      </div>
    </footer>
  );
}
