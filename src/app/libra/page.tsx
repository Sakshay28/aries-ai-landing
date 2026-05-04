"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════
// 🌗 Libra AI — Instagram DM Automation Landing Page
// ═══════════════════════════════════════════════════════════
// Served when host = libra.ai (host-based rewrite in proxy.ts).
// Aries shares the same backend; only branding differs here.
// ═══════════════════════════════════════════════════════════

const PINK = "#E1306C";
const PURPLE = "#833AB4";
const ORANGE = "#F77737";
const GRADIENT = `linear-gradient(135deg, ${PURPLE} 0%, ${PINK} 50%, ${ORANGE} 100%)`;

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
      background: scrolled ? "rgba(255,255,255,0.96)" : "#fff",
      backdropFilter: "blur(12px)",
      borderBottom: scrolled ? "1px solid #f3e8ff" : "1px solid transparent",
      padding: "0 40px", height: 68,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: "all 0.3s",
    }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: GRADIENT,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18,
        }}>L</div>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>Libra AI</span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {["Features", "Use Cases", "Pricing", "Contact"].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`} style={{ color: "#555", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>{item}</a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/login" style={{ color: "#555", padding: "10px 18px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Login</Link>
          <Link href="/signup?brand=libra" style={{ background: GRADIENT, color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Start Free Trial →</Link>
        </div>
      </div>
    </nav>
  );
}

function InstagramMockup() {
  const msgs = [
    { from: "user", text: "do u ship to delhi?" },
    { from: "bot", text: "Yes! Free shipping pan-India on orders ₹999+ ✨" },
    { from: "user", text: "the black dress in ur last reel?" },
    { from: "bot", text: "The Midnight Slip — ₹2,499. Want me to send the link & reserve a size?" },
    { from: "user", text: "yes size M" },
    { from: "bot", text: "Reserved size M for 24h 💖\nCheckout: libra.ai/p/midnight-slip" },
  ];
  return (
    <div style={{ width: 300, background: "#fff", borderRadius: 32, overflow: "hidden", boxShadow: "0 40px 100px rgba(131, 58, 180, 0.25)", border: "10px solid #111" }}>
      <div style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #efefef" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: GRADIENT, padding: 2 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👗</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>@yourbrand</div>
          <div style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>● Active now</div>
        </div>
      </div>
      <div style={{ padding: "14px 12px", height: 380, overflow: "hidden", background: "#fafafa" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div style={{
              background: m.from === "user" ? "#efefef" : GRADIENT,
              color: m.from === "user" ? "#111" : "#fff",
              padding: "9px 14px", borderRadius: 18,
              maxWidth: "75%", fontSize: 13, lineHeight: 1.4,
              whiteSpace: "pre-line",
            }}>{m.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: "💬", title: "Reply to every DM in seconds", desc: "AI handles size, price, shipping, availability questions — 24/7, in your brand voice." },
  { icon: "🎯", title: "Story & Reel comment automation", desc: "Auto-DM anyone who comments a keyword on your reel or story. Convert engagement into sales." },
  { icon: "🛍️", title: "Product catalog + order capture", desc: "Connect your Shopify or just paste your catalog. Libra closes the sale inside DMs." },
  { icon: "🤝", title: "Lead qualification & handoff", desc: "Hot leads pinged to your phone. Cold leads followed up automatically across 30min/3hr/24hr." },
  { icon: "📊", title: "Per-campaign analytics", desc: "Which reel drove the most DMs? Which keyword converts? Real charts, not vanity metrics." },
  { icon: "🌐", title: "11 Indian languages", desc: "Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, and more — powered by Sarvam AI." },
];

const USE_CASES = [
  { tag: "Fashion / D2C", text: "Reply to size & shipping DMs while you sleep. Reserve products from Reels comments." },
  { tag: "Creators", text: "Sponsor inbound? Brand collab requests? Libra qualifies and forwards only the serious ones." },
  { tag: "Salons / Studios", text: "Book appointments via DM. Auto-confirm, auto-remind, no-show recovery." },
  { tag: "Restaurants", text: "Story polls drive reservations. Libra captures the booking inside the DM." },
];

const PRICING = [
  { name: "Starter", price: "₹999", per: "/mo", features: ["1,000 DMs / month", "1 Instagram account", "Basic AI replies", "Email support"], highlight: false },
  { name: "Growth", price: "₹2,499", per: "/mo", features: ["5,000 DMs / month", "Story & Reel automation", "Catalog integration", "Priority support"], highlight: true },
  { name: "Pro", price: "₹6,999", per: "/mo", features: ["25,000 DMs / month", "Multi-account", "Custom AI training", "Dedicated success manager"], highlight: false },
];

export default function LibraLanding() {
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#fff", color: "#111", margin: 0, paddingTop: 68 }}>
      <Navbar />

      {/* HERO */}
      <section style={{ padding: "80px 40px 100px", maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 60, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-block", background: "#fdf2f8", color: PINK, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            ✨ Built on the official Instagram Messaging API
          </div>
          <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, marginBottom: 20, letterSpacing: "-0.02em" }}>
            Turn Instagram DMs into <span style={{ background: GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>your sales engine.</span>
          </h1>
          <p style={{ fontSize: 19, color: "#555", lineHeight: 1.6, marginBottom: 36, maxWidth: 540 }}>
            Libra AI replies to every DM, comment, and Story reaction the second it lands — qualifies the lead, closes the sale, and pings you only when a human is needed.
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Link href="/signup?brand=libra" style={{ background: GRADIENT, color: "#fff", padding: "16px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: "none", boxShadow: "0 12px 32px rgba(225, 48, 108, 0.35)" }}>Start 14-day Free Trial →</Link>
            <a href="#how-it-works" style={{ color: "#111", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>See how it works ↓</a>
          </div>
          <div style={{ marginTop: 28, display: "flex", gap: 28, color: "#666", fontSize: 13 }}>
            <span>✓ No credit card required</span>
            <span>✓ Cancel anytime</span>
            <span>✓ Indian payment methods</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}><InstagramMockup /></div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "100px 40px", background: "#fafafa" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ display: "inline-block", background: "#fdf2f8", color: PINK, padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>FEATURES</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>Everything you need to monetize your Instagram</h2>
            <p style={{ color: "#666", fontSize: 17 }}>Six features. One subscription. Zero engineering required.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: "#fff", padding: 28, borderRadius: 16, border: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" style={{ padding: "100px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>Built for the way you sell on Instagram</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {USE_CASES.map((u, i) => (
              <div key={i} style={{ padding: 28, borderRadius: 16, background: "#fff", border: "1px solid #f0f0f0" }}>
                <div style={{ display: "inline-block", background: GRADIENT, color: "#fff", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{u.tag}</div>
                <p style={{ color: "#333", fontSize: 16, lineHeight: 1.6, margin: 0 }}>{u.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "100px 40px", background: "#fafafa" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>Live in 5 minutes</h2>
            <p style={{ color: "#666", fontSize: 17 }}>No code. No engineer. No Meta paperwork on your end.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {[
              { n: 1, t: "Connect Instagram", d: "One-click OAuth via Meta. We handle the Business Account + Page linking." },
              { n: 2, t: "Train Libra on your brand", d: "Paste your FAQs, USPs, pricing. Libra learns your voice in seconds." },
              { n: 3, t: "Watch DMs convert", d: "Replies start instantly. Hot leads ping your phone. Analytics roll in live." },
            ].map(s => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: GRADIENT, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{s.n}</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{s.t}</h3>
                <p style={{ color: "#666", fontSize: 15, lineHeight: 1.6 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "100px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>Pricing that scales with your DMs</h2>
            <p style={{ color: "#666", fontSize: 17 }}>14-day free trial on every plan. No setup fee. Cancel anytime.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {PRICING.map((p, i) => (
              <div key={i} style={{
                padding: 32, borderRadius: 20,
                background: p.highlight ? GRADIENT : "#fff",
                color: p.highlight ? "#fff" : "#111",
                border: p.highlight ? "none" : "1px solid #eee",
                boxShadow: p.highlight ? "0 24px 60px rgba(225, 48, 108, 0.3)" : "0 2px 12px rgba(0,0,0,0.04)",
                transform: p.highlight ? "scale(1.04)" : "none",
                position: "relative",
              }}>
                {p.highlight && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "4px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>MOST POPULAR</div>}
                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{p.name}</h3>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 44, fontWeight: 800 }}>{p.price}</span>
                  <span style={{ fontSize: 16, opacity: 0.7 }}>{p.per}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0" }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ padding: "8px 0", fontSize: 14, opacity: p.highlight ? 0.95 : 0.8 }}>✓ {f}</li>
                  ))}
                </ul>
                <Link href="/signup?brand=libra" style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: "none", background: p.highlight ? "#fff" : GRADIENT, color: p.highlight ? PINK : "#fff" }}>Start Free Trial →</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 40px", background: GRADIENT, color: "#fff", textAlign: "center" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16, letterSpacing: "-0.02em" }}>Stop losing DMs to delayed replies.</h2>
          <p style={{ fontSize: 19, opacity: 0.92, marginBottom: 36 }}>Every minute you wait, a follower drops off. Libra never sleeps.</p>
          <Link href="/signup?brand=libra" style={{ display: "inline-block", background: "#fff", color: PINK, padding: "18px 44px", borderRadius: 12, fontSize: 17, fontWeight: 800, textDecoration: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}>Start your 14-day Free Trial →</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="contact" style={{ padding: "60px 40px 40px", background: "#0f0f0f", color: "#aaa" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>L</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Libra AI</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320 }}>AI-powered Instagram DM automation for Indian creators, D2C brands, and service businesses.</p>
          </div>
          <div>
            <h4 style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>Product</h4>
            <a href="#features" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Features</a>
            <a href="#pricing" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Pricing</a>
            <Link href="/signup?brand=libra" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Free Trial</Link>
          </div>
          <div>
            <h4 style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>Company</h4>
            <a href="mailto:support@libraai.in" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>support@libraai.in</a>
            <a href="/privacy" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Privacy</a>
            <a href="/terms" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Terms</a>
          </div>
          <div>
            <h4 style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.6 }}>Family</h4>
            <a href="https://ariesai.in" style={{ display: "block", padding: "4px 0", color: "#aaa", fontSize: 14, textDecoration: "none" }}>Aries AI (WhatsApp)</a>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #222", marginTop: 40, paddingTop: 24, textAlign: "center", fontSize: 12 }}>© 2026 Libra AI. All rights reserved.</div>
      </footer>
    </div>
  );
}
