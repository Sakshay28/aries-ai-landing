"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const G = "#25D366";
const GD = "#128C7E";

const s = {
  body: { fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#fff", color: "#111", margin: 0 },
};

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
      background: scrolled ? "rgba(255,255,255,0.95)" : "#fff",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #eee",
      padding: "0 40px", height: 68,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: "all 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 40 }} />
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {["Features", "Use Cases", "How It Works", "Pricing", "Contact Us"].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`} style={{ color: "#555", fontSize: 15, fontWeight: 500, textDecoration: "none" }}>{item}</a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/login" className="btn-anim" style={{ background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 140, textAlign: "center" }}>Login</Link>
          <Link href="/signup" className="btn-anim" style={{ background: G, color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", minWidth: 140, textAlign: "center" }}>Start Free Trial →</Link>
        </div>
      </div>
    </nav>
  );
}

function PhoneMockup() {
  const msgs = [
    { from: "user", text: "Hi, table for 4 tonight at 8pm?" },
    { from: "bot", text: "Hi! 😊 Yes, we have availability. May I have your name?" },
    { from: "user", text: "Rahul Sharma" },
    { from: "bot", text: "Perfect Rahul! Table for 4 at 8 PM confirmed ✅\nYou'll get a reminder 1 hour before." },
  ];
  return (
    <div style={{ width: 280, background: "#E5DDD5", borderRadius: 24, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.18)", border: "8px solid #111" }}>
      <div style={{ background: GD, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍽️</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Spice Garden</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>online</div>
        </div>
      </div>
      <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 280 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              background: m.from === "user" ? "#DCF8C6" : "#fff",
              borderRadius: m.from === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "8px 12px", maxWidth: "80%", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}>{m.text}</div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ background: "#fff", borderRadius: "12px 12px 12px 2px", padding: "8px 12px", fontSize: 12, color: "#999" }}>typing...</div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #f0fdf4 0%, #fff 50%, #f0fdf4 100%)", paddingTop: 80 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "60px 40px", display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 60, alignItems: "center" }}>
        <div>

          <h1 style={{ fontSize: "clamp(36px, 4vw, 56px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-2px", marginBottom: 20 }}>
            Automate Your<br />
            <span style={{ color: G }}>WhatsApp Business</span><br />
            With AI
          </h1>
          <p style={{ fontSize: 18, color: "#555", lineHeight: 1.7, marginBottom: 36, maxWidth: 480 }}>
            Your AI assistant replies to customer enquiries, takes bookings, captures leads, and follows up — 24/7. While you sleep.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 40 }}>
            <Link href="/signup" className="btn-anim" style={{ background: G, color: "#fff", padding: "16px 32px", borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
              Start Free 14-Day Trial →
            </Link>
            <a href="#how-it-works" className="btn-anim-outline" style={{ background: "#fff", color: "#111", padding: "16px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: "none", border: "1.5px solid #ddd" }}>
              See How It Works
            </a>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {["Free 14-day trial", "Pay with UPI later", "Setup in under 10 minutes"].map(t => (
              <span key={t} style={{ fontSize: 13, color: "#777", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, display: "inline-block" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          <img
            src="/page.png"
            alt="WhatsApp AI automation in action"
            style={{
              width: "100%",
              maxWidth: 960,
              transform: "scale(1.3) translateX(100px)",
              transformOrigin: "center right",
              height: "auto",
              position: "relative",
              zIndex: 1,
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
    <section style={{
      background: "#fff",
      padding: "80px 40px",
      overflow: "hidden",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#25D366", textTransform: "uppercase", marginBottom: 12 }}>
          See It In Action
        </p>
        <h2 style={{ fontSize: "clamp(30px, 3.5vw, 48px)", fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 16, color: "#111", lineHeight: 1.15 }}>
          Turn Every Conversation Into a Sale
        </h2>
        <p style={{ fontSize: 17, color: "#666", maxWidth: 520, margin: "0 auto 56px", lineHeight: 1.7 }}>
          From product enquiries to checkout — your AI handles the entire customer journey on WhatsApp, automatically.
        </p>
        <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          <img
            src="/hero.png"
            alt="WhatsApp Business Automation in action"
            style={{
              width: "100%",
              maxWidth: 1100,
              height: "auto",
              WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const stats = [
    { n: "500+", l: "Businesses" },
    { n: "10L+", l: "Messages Sent" },
    { n: "98%", l: "Uptime" },
    { n: "4.9★", l: "Avg Rating" },
  ];
  return (
    <section style={{ background: "#111", padding: "40px 40px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24 }}>
        {stats.map(s => (
          <div key={s.n} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: G }}>{s.n}</div>
            <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
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
    <section id="features" style={{ padding: "64px 40px 100px", background: "#f8fafb", scrollMarginTop: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>Features</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Everything You Need to <span style={{ color: G }}>Close More Leads</span>
          </h2>
          <p style={{ color: "#777", fontSize: 17, marginTop: 12, maxWidth: 540, margin: "12px auto 0" }}>
            Built for restaurants, salons, clinics, real estate agents, and any business getting WhatsApp enquiries.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {feats.map(f => (
            <div key={f.title} style={{ background: "#fff", borderRadius: 16, padding: 32, border: "1px solid #eee", transition: "box-shadow 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${f.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 20 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
              <p style={{ color: "#777", fontSize: 14, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Industries() {
  const list = [
    {
      title: "E-Commerce & Retail",
      desc: "Automate abandoned cart recovery, send order updates, handle product inquiries and COD confirmations instantly.",
      color: "#10B981",
      bg: "#F0FDF4",
    },
    {
      title: "Real Estate",
      desc: "Qualify high-intent buyers automatically, answer property queries and schedule site visits 24/7 without any manual effort.",
      color: "#3B82F6",
      bg: "#EFF6FF",
    },
    {
      title: "Healthcare & Clinics",
      desc: "Manage appointment bookings, send automated reminders, handle patient FAQs and follow-ups seamlessly.",
      color: "#8B5CF6",
      bg: "#F5F3FF",
    },
    {
      title: "Travel & Hospitality",
      desc: "Handle booking inquiries, share custom itineraries, send trip reminders and upsell premium packages instantly.",
      color: "#EC4899",
      bg: "#FDF2F8",
    },
    {
      title: "Cafes & Restaurants",
      desc: "Accept table reservations, send daily menu updates, run loyalty offers and handle customer queries on WhatsApp.",
      color: "#D97706",
      bg: "#FFFBEB",
    },
    {
      title: "Clubs & Nightlife",
      desc: "Send event announcements, manage guest list confirmations, promote exclusive offers and handle entry queries automatically.",
      color: "#EF4444",
      bg: "#FEF2F2",
    },
  ];

  const CardItem = ({ i }: { i: typeof list[0] }) => (
    <div className="uc-card" style={{
      background: "#fff",
      borderRadius: 16,
      padding: "28px 28px 28px 24px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      borderLeft: `4px solid ${i.color}`,
      display: "flex",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: i.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: i.color, opacity: 0.85 }} />
      </div>
      <div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px", letterSpacing: "-0.3px" }}>{i.title}</h3>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65, margin: 0 }}>{i.desc}</p>
      </div>
    </div>
  );

  return (
    <section id="use-cases" style={{ padding: "64px 40px 100px", background: "#F7F8FA", scrollMarginTop: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        .uc-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .uc-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.10) !important; }
      `}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, letterSpacing: "-1.5px", color: "#1a1a1a", margin: "0 0 16px" }}>
            Built for <span style={{ color: "#25D366" }}>Modern Businesses</span>
          </h2>
          <p style={{ fontSize: 18, color: "#6B7280", maxWidth: 580, margin: "0 auto", lineHeight: 1.65 }}>
            Whatever your industry, Aries AI adapts to your unique workflows to turn conversations into revenue.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 20 }}>
          {list.slice(0, 3).map(i => <CardItem key={i.title} i={i} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {list.slice(3, 6).map(i => <CardItem key={i.title} i={i} />)}
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
    <section id="how-it-works" style={{ padding: "100px 40px", background: "#f8fafb", scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>How It Works</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Live in <span style={{ color: G }}>Under 5 Minutes</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 40 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ textAlign: "center", position: "relative" }}>
              {i < steps.length - 1 && (
                <div style={{ position: "absolute", top: 32, left: "calc(50% + 60px)", width: "calc(100% - 120px)", height: 2, background: "linear-gradient(to right, #25D366, #dcfce7)", display: "block" }} className="step-connector" />
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
    <section style={{ background: "#fff", padding: "80px 40px" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 64, alignItems: "center" }}>
        {/* Left: Text */}
        <div>
          <h2 style={{ fontSize: "clamp(30px, 3.5vw, 48px)", fontWeight: 900, color: "#1a1a1a", lineHeight: 1.15, letterSpacing: "-1px", marginBottom: 16 }}>
            Get WhatsApp AI Running in{" "}
            <span style={{ color: "#25D366" }}>Under 10 Minutes</span>
          </h2>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.65, marginBottom: 40, maxWidth: 420 }}>
            Aries AI connects directly to WhatsApp Business API — no coding, no third-party tools, no waiting.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
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
          <a href="#" className="btn-anim" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 40, background: "#25D366", color: "#fff", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            Start Free for 14 Days →
          </a>
        </div>
        {/* Right: Image */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: "-20px -20px -20px 20px", background: "#f0fdf4", borderRadius: 24, zIndex: 0 }} />
          <img
            src="/setup-mockup.png"
            alt="Aries AI Setup Mockup"
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              position: "relative",
              zIndex: 1,
              borderRadius: 16,
              filter: "drop-shadow(0 24px 48px rgba(0,0,0,0.12))",
            }}
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
      name: "Starter", price: "999", period: "/month", oldPrice: "1,499",
      desc: "For single location businesses",
      caps: ["Up to 500 contacts", "1,000 conversations/month"],
      features: ["Free WhatsApp Business API", "Free Blue Tick Application", "₹50 Free Conversation Credits", "Unlimited Free Service Conversations", "Basic AI Chatbot", "Live Chat Dashboard", "Create Template Messages", "Upload & Manage Contacts", "Up to 5 Tags"],
      cta: "Start Free Trial", popular: false,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null,
    },
    {
      name: "Growth", price: "2,499", period: "/month", oldPrice: "3,999",
      desc: "Scale your WhatsApp marketing",
      caps: ["Up to 10,000 contacts", "5,000 conversations/month"],
      features: ["Everything in Free, plus:", "AI Chatbot with Custom Training", "WhatsApp Broadcast Campaigns", "Click-to-WhatsApp Ads Manager", "Campaign Analytics & Reports", "Custom Attributes & Segments", "Up to 20 Tags", "Email Support"],
      cta: "Start Free Trial", popular: false,
      templateCharges: { marketing: "₹1.09", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null,
    },
    {
      name: "Pro", price: "4,999", period: "/month", oldPrice: "6,999",
      desc: "WhatsApp + Instagram AI automation",
      caps: ["Up to 50,000 contacts", "Unlimited conversations"],
      features: ["Everything in Growth, plus:", "Instagram DM Automation", "Advanced Gemini AI Engine", "Multi-Agent Live Chat", "CRM & Advanced Analytics", "Workflow Automation Builder", "In-Chat Payments (UPI/Cards)", "Unlimited Tags & Attributes", "Priority Support"],
      cta: "Start Free Trial", popular: true,
      templateCharges: { marketing: "₹0.90", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: null,
    },
    {
      name: "Ultra Premium", price: "6,999", period: "/month", oldPrice: "9,999",
      desc: "AI Voice Calling + Full automation suite",
      caps: ["Unlimited contacts", "Unlimited conversations"],
      features: ["Everything in Pro, plus:", "🔥 AI Voice Calling for Booking Confirmation", "150 AI Voice Calls Included", "Auto WhatsApp Fallback on Missed Calls", "Dedicated Account Manager", "Custom Integrations & API Access", "White-label Reports", "Onboarding Assistance", "24/7 Priority Support"],
      cta: "Start Free Trial", popular: false,
      templateCharges: { marketing: "Custom", utility: "₹0.145", auth: "₹0.145", service: "Unlimited Free" },
      voiceCalls: { included: 150, addon: "₹15/call after 150 calls", topup: "₹999 for 100 extra calls" },
    },
  ];

  const getPrice = (price: string) => {
    if (price === "0") return "0";
    const num = parseInt(price.replace(",", ""));
    if (billing === "annual") return Math.round(num * 0.8).toLocaleString("en-IN");
    return price;
  };

  return (
    <section id="pricing" style={{ padding: "64px 40px 100px", background: "#fff", scrollMarginTop: 20 }}>
      <style>{`
        .pc {
          background: #fff; color: #111; border: 1px solid #e8e8e8;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.03);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pc:hover {
          background: #0a0a0a; color: #fff; border-color: #0a0a0a;
          transform: scale(1.03) translateY(-4px);
          box-shadow: 0 32px 80px rgba(0,0,0,0.25);
        }
        .pc .pd { color: #999; transition: color 0.4s; }
        .pc:hover .pd { color: #bbb; }
        .pc .ps { color: #999; transition: color 0.4s; }
        .pc:hover .ps { color: #bbb; }
        .pc .po { color: #bbb; transition: color 0.4s; }
        .pc:hover .po { color: #666; }
        .pc .pb { background: #111; color: #fff; transition: all 0.4s; }
        .pc:hover .pb { background: #25D366; box-shadow: 0 4px 20px rgba(37,211,102,0.35); }
        .pc .pb:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 12px 28px rgba(37,211,102,0.5) !important; }
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
        .toggle-area { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 48; }
        .toggle-area span { font-size: 14px; font-weight: 600; color: #999; cursor: pointer; transition: color 0.2s; user-select: none; }
        .toggle-area span.active { color: #111; }
        .t-switch { width: 44px; height: 24px; border-radius: 100px; background: #ddd; border: none; cursor: pointer; position: relative; transition: background 0.3s; padding: 0; }
        .t-switch.on { background: #25D366; }
        .t-thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .t-switch.on .t-thumb { transform: translateX(20px); }
        .save-tag { display: inline-block; background: #dcfce7; color: #128C7E; font-size: 11px; font-weight: 700; border-radius: 100px; padding: 2px 8px; margin-left: 6px; }
      `}</style>
      <div style={{ maxWidth: 1300, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ background: "#dcfce7", color: GD, padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>Pricing</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,44px)", fontWeight: 900, marginTop: 16, letterSpacing: "-1px" }}>
            Simple, <span style={{ color: G }}>Transparent</span> Pricing
          </h2>
          <p style={{ color: "#999", fontSize: 16, marginTop: 12 }}>No hidden charges. Pay only for what you use. All plans include WhatsApp Business API.</p>
        </div>

        {/* Billing Toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 48 }}>
          <span className={billing === "monthly" ? "active" : ""} style={{ fontSize: 14, fontWeight: 600, color: billing === "monthly" ? "#111" : "#999", cursor: "pointer" }} onClick={() => setBilling("monthly")}>Monthly</span>
          <button className={`t-switch ${billing === "annual" ? "on" : ""}`} onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")} aria-label="Toggle billing cycle">
            <span className="t-thumb" />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: billing === "annual" ? "#111" : "#999", cursor: "pointer" }} onClick={() => setBilling("annual")}>
            Annual <span className="save-tag">Save 20%</span>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, maxWidth: 1280, margin: "0 auto" }}>
          {plans.map(plan => (
            <div key={plan.name} className="pc" style={{
              borderRadius: 24, padding: "36px 28px 28px", position: "relative",
            }}>
              {plan.popular && (
                <div className="pop-badge" style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: G, color: "#fff", padding: "5px 20px", borderRadius: 100, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.5px" }}>
                  MOST POPULAR
                </div>
              )}
              <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: "inherit" }}>{plan.name}</h3>
              <p className="pd" style={{ fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>{plan.desc}</p>

              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                {plan.oldPrice && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span className="po" style={{ fontSize: 15, textDecoration: "line-through" }}>₹{plan.oldPrice}</span>
                    <span style={{ background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100 }}>
                      {Math.round((1 - parseInt(plan.price.replace(",", "")) / parseInt(plan.oldPrice.replace(",", ""))) * 100)}% OFF
                    </span>
                  </div>
                )}
                <span className="ps" style={{ fontSize: 15 }}>₹</span>
                <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-2px", color: "inherit" }}>{getPrice(plan.price)}</span>
                <span className="ps" style={{ fontSize: 14 }}> {plan.period}</span>
                {billing === "annual" && plan.price !== "0" && (
                  <div style={{ fontSize: 12, color: G, fontWeight: 600, marginTop: 4 }}>Billed annually</div>
                )}
              </div>

              <Link href="/signup" className="pb" style={{
                display: "block", textAlign: "center",
                padding: "13px", borderRadius: 12,
                fontWeight: 700, fontSize: 15, textDecoration: "none",
              }}>
                {plan.cta}
              </Link>

              {/* Caps */}
              <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "20px 0 16px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {plan.caps.map(cap => (
                  <div key={cap} className="cap-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12 }}>📊</span> {cap}
                  </div>
                ))}
              </div>

              {/* Features */}
              <hr className="sep" style={{ border: "none", borderTop: "1px solid", margin: "0 0 16px" }} />
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, padding: 0, margin: 0 }}>
                {plan.features.map(f => (
                  <li key={f} className={f.startsWith("🔥") ? "pf pf-highlight" : "pf"} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <span style={{ color: G, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>

              {/* Voice Call Add-On */}
              {plan.voiceCalls && (
                <div className="voice-box">
                  <div className="voice-title">📞 AI Voice Call Add-On</div>
                  <div className="voice-detail">• {plan.voiceCalls.included} calls included free</div>
                  <div className="voice-detail">• {plan.voiceCalls.addon}</div>
                  <div className="voice-detail">• Top-up: {plan.voiceCalls.topup}</div>
                </div>
              )}

              {/* Template Charges */}
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

        {/* Trust strip */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", paddingTop: 48 }}>
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
    <section style={{ padding: "80px 40px", background: G }}>
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(28px,3vw,44px)", fontWeight: 900, color: "#fff", letterSpacing: "-1px", marginBottom: 16 }}>
          Ready to Automate Your Business?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, marginBottom: 36 }}>
          Join hundreds of businesses already converting WhatsApp enquiries into revenue — automatically.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn-anim-white" style={{ background: "#fff", color: G, padding: "18px 40px", borderRadius: 12, fontWeight: 800, fontSize: 17, textDecoration: "none", display: "inline-block" }}>
            Start Your Free Trial →
          </Link>
          <a href="#contact-us" className="btn-anim-white" style={{ background: "#fff", color: G, padding: "18px 40px", borderRadius: 12, fontWeight: 800, fontSize: 17, textDecoration: "none", display: "inline-block" }}>
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
    <footer id="contact-us" style={{ background: "#111", padding: "48px 40px", color: "#aaa" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 36, filter: "brightness(0) invert(1)" }} />
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 13 }}>
          {["Privacy Policy", "Terms of Service", "Support"].map(l => (
            <a key={l} href="#" style={{ color: "#aaa", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 13, margin: 0 }}>© 2026 Aries AI. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div style={s.body}>
      <style>{`
        .btn-anim {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 4px 12px rgba(37,211,102,0.2) !important;
        }
        .btn-anim:hover {
          transform: translateY(-4px) scale(1.03) !important;
          box-shadow: 0 16px 40px rgba(37, 211, 102, 0.45) !important;
        }
        .btn-anim-outline {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .btn-anim-outline:hover {
          transform: translateY(-4px) scale(1.03) !important;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08) !important;
          border-color: #25D366 !important;
          color: #25D366 !important;
        }
        .btn-anim-white {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
        }
        .btn-anim-white:hover {
          transform: translateY(-4px) scale(1.03) !important;
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.25) !important;
          color: #128C7E !important;
        }
      `}</style>
      <Navbar />
      <Hero />
      <ShowcaseSection />
      <TrustBar />
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
