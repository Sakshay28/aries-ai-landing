"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// ═══════════════════════════════════════════════════════════
// 🚀 Onboarding Wizard — 3 steps, luxury concierge feel
// Step 1: Business profile
// Step 2: AI assistant personality
// Step 3: WhatsApp activation (white-label, no mention of Gupshup)
// ═══════════════════════════════════════════════════════════

const G = "#25D366";
const GD = "#128C7E";

const BUSINESS_TYPES = [
  "Restaurant & Hospitality",
  "Healthcare & Clinics",
  "Real Estate",
  "Retail & D2C",
  "Salon & Beauty",
  "Education",
  "Finance & Insurance",
  "Other",
];

const PERSONALITIES = [
  { value: "Professional and formal", label: "Professional & Formal", desc: "Polished, precise, enterprise-grade tone", example: '"Hello, how may I assist you today?"' },
  { value: "Friendly and approachable", label: "Friendly & Warm", desc: "Conversational, personable, customer-first", example: '"Hey there! 👋 How can I help?"' },
  { value: "Casual and fun", label: "Casual & Fun", desc: "Relaxed, emoji-friendly, youthful energy", example: '"Yo! What\'s up? 😎 Need some help?"' },
  { value: "Elegant and exclusive", label: "Elegant & Luxurious", desc: "Premium feel, refined language, high-end brand", example: '"Welcome. It is our pleasure to serve you."' },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: i < current ? 28 : 28,
            height: 6,
            borderRadius: 99,
            background: i < current ? G : i === current ? G : "#e5e7eb",
            opacity: i === current ? 1 : i < current ? 0.4 : 1,
            transition: "all 0.4s ease",
          }} />
        </div>
      ))}
      <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
        Step {current + 1} of {total}
      </span>
    </div>
  );
}

function PersonalityCard({
  option,
  selected,
  onClick,
}: {
  option: (typeof PERSONALITIES)[0];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "14px 16px",
        border: `2px solid ${selected ? G : "#e5e7eb"}`,
        borderRadius: 12,
        background: selected ? "rgba(37,211,102,0.06)" : "#fafbfc",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "all 0.18s ease",
        fontFamily: "inherit",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        border: `2px solid ${selected ? G : "#d1d5db"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "all 0.18s ease",
      }}>
        {selected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: G }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{option.label}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{option.desc}</div>
        {selected && (
          <div style={{ fontSize: 12, color: GD, fontWeight: 500, fontStyle: "italic", background: "rgba(255,255,255,0.6)", padding: "4px 8px", borderRadius: 6, display: "inline-block" }}>
            Example: {option.example}
          </div>
        )}
      </div>
    </button>
  );
}

function OnboardContent() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  // Step 2
  const [botName, setBotName] = useState("");
  const [personality, setPersonality] = useState(PERSONALITIES[1].value);
  const [welcomeMsg, setWelcomeMsg] = useState("");

  // Step 3 (WhatsApp number — white-labeled)
  const [waPhone, setWaPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Pre-fill business name from Supabase user metadata
  useEffect(() => {
    (async () => {
      const sb = createBrowserSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user?.user_metadata?.full_name) {
        const first = (user.user_metadata.full_name as string).split(" ")[0];
        setBusinessName(`${first}'s Business`);
        setBotName("Aria");
      }
    })();
  }, []);

  async function handleStep1() {
    if (!businessName.trim()) { setError("Please enter your business name."); return; }
    setError("");
    setStep(1);
  }

  async function handleStep2() {
    if (!botName.trim()) { setError("Please give your AI assistant a name."); return; }
    setError("");
    setStep(2);
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
          business_type: businessType,
          business_phone: businessPhone.trim() || null,
          bot_name: botName.trim(),
          bot_personality: personality,
          welcome_message: welcomeMsg.trim() || null,
          whatsapp_number_requested: waPhone.trim() || null,
          business_description: businessDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save setup.");
      setSubmitted(true);
      setTimeout(() => router.replace("/dashboard"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={styles.root}>
        <div style={styles.successWrap}>
          <div style={styles.successIcon}>🎉</div>
          <h1 style={styles.successTitle}>You're all set!</h1>
          <p style={styles.successSub}>Taking you to your Aries AI dashboard…</p>
          <div style={styles.successDots}>
            {[0,1,2].map(i => (
              <div key={i} style={{ ...styles.dot, animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Left pane */}
      <aside style={styles.left}>
        <div style={styles.leftInner}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: 36 }} />
          </Link>

          <div>
            <h1 style={styles.heroTitle}>
              Let's set up your<br /><span style={{ color: G }}>AI Command Centre</span>
            </h1>
            <p style={styles.heroSub}>
              Three quick steps and your personalised WhatsApp AI is ready to handle customer conversations 24/7.
            </p>

            {/* Step previews */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              {[
                { icon: "🏢", title: "Business Profile", text: "Your name, industry & contact" },
                { icon: "🤖", title: "AI Personality", text: "Name, tone & welcome message" },
                { icon: "📱", title: "WhatsApp Activation", text: "We'll handle the rest for you" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "13px 16px",
                  borderRadius: 12,
                  background: i === step ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${i === step ? "rgba(37,211,102,0.3)" : "rgba(16,185,129,0.12)"}`,
                  backdropFilter: "blur(6px)",
                  transition: "all 0.3s ease",
                  opacity: i > step ? 0.55 : 1,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "#fff", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 17, flexShrink: 0,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                  }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{item.text}</div>
                  </div>
                  {i < step && <div style={{ marginLeft: "auto", color: G, fontSize: 16 }}>✓</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: G, display: "inline-block", boxShadow: `0 0 0 4px rgba(37,211,102,0.2)` }} />
            <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>
              Trusted by Indian D2C, clinics, real estate & hospitality teams
            </span>
          </div>
        </div>
      </aside>

      {/* Right pane */}
      <main style={styles.right}>
        <div style={styles.formCard}>
          <StepIndicator current={step} total={3} />

          {/* ── STEP 1: Business Profile ── */}
          {step === 0 && (
            <>
              <p style={styles.eyebrow}>Step 1 — Business Profile</p>
              <h2 style={styles.formTitle}>Tell us about your business</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Field label="Business Name *">
                  <input
                    style={styles.input}
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g. Spice Garden Restaurant"
                    onFocus={focusOn} onBlur={focusOff}
                    autoFocus
                  />
                </Field>

                <Field label="Industry / Business Type">
                  <div style={{ position: "relative" }}>
                    <select
                      style={{ ...styles.input, appearance: "none", paddingRight: 36 }}
                      value={businessType}
                      onChange={e => {
                        setBusinessType(e.target.value);
                        if (e.target.value !== "Other") setBusinessDescription("");
                      }}
                    >
                      {BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <svg style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                  </div>
                </Field>

                {businessType === "Other" && (
                  <Field label="What is your business about?">
                    <textarea
                      style={{ ...styles.input, minHeight: 80, resize: "vertical", lineHeight: 1.55 }}
                      value={businessDescription}
                      onChange={e => setBusinessDescription(e.target.value)}
                      placeholder="e.g. We are a D2C brand selling organic skincare products..."
                      onFocus={focusOn as any} onBlur={focusOff as any}
                    />
                    <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, marginBottom: 0 }}>
                      This helps your AI understand your products/services so it can answer questions better.
                    </p>
                  </Field>
                )}

                <Field label="Business Phone (optional)">
                  <input
                    style={styles.input}
                    value={businessPhone}
                    onChange={e => setBusinessPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </Field>

                {error && <ErrorBox msg={error} />}

                <button
                  onClick={handleStep1}
                  style={styles.submitBtn}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 28px rgba(37,211,102,0.35)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 18px rgba(37,211,102,0.28)"; }}
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: AI Personality ── */}
          {step === 1 && (
            <>
              <p style={styles.eyebrow}>Step 2 — AI Assistant</p>
              <h2 style={styles.formTitle}>Personalise your AI</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Field label="AI Assistant Name *">
                  <input
                    style={styles.input}
                    value={botName}
                    onChange={e => setBotName(e.target.value)}
                    placeholder="e.g. Aria, Maya, Nova"
                    onFocus={focusOn} onBlur={focusOff}
                    autoFocus
                  />
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, marginBottom: 0 }}>
                    This is the name your customers will see in WhatsApp replies.
                  </p>
                </Field>

                <Field label="Tone of Voice">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {PERSONALITIES.map(opt => (
                      <PersonalityCard
                        key={opt.value}
                        option={opt}
                        selected={personality === opt.value}
                        onClick={() => setPersonality(opt.value)}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="First Greeting Message (optional)">
                  <textarea
                    style={{ ...styles.input, minHeight: 80, resize: "vertical", lineHeight: 1.55 }}
                    value={welcomeMsg}
                    onChange={e => setWelcomeMsg(e.target.value)}
                    placeholder={`e.g. Hey! 👋 Welcome to ${businessName || "our business"}. How can I help you today?`}
                    onFocus={focusOn as any} onBlur={focusOff as any}
                  />
                </Field>

                {error && <ErrorBox msg={error} />}

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => { setError(""); setStep(0); }} style={styles.backBtn}>← Back</button>
                  <button
                    onClick={handleStep2}
                    style={{ ...styles.submitBtn, flex: 1 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3: WhatsApp Activation ── */}
          {step === 2 && (
            <>
              <p style={styles.eyebrow}>Step 3 — WhatsApp Activation</p>
              <h2 style={styles.formTitle}>Connect your WhatsApp</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Trust badge */}
                <div style={{
                  display: "flex", gap: 14, padding: "16px 18px",
                  background: "rgba(37,211,102,0.06)",
                  border: "1px solid rgba(37,211,102,0.2)",
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>🔒</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                      Secure, managed activation
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55 }}>
                      Our team will securely link your WhatsApp Business number to the Aries AI gateway. No technical work needed from your side.
                    </div>
                  </div>
                </div>

                <Field label="WhatsApp Business Number">
                  <input
                    style={styles.input}
                    value={waPhone}
                    onChange={e => setWaPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    onFocus={focusOn} onBlur={focusOff}
                  />
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, marginBottom: 0 }}>
                    Must be a WhatsApp Business number. Our team will confirm activation within 1–2 hours.
                  </p>
                </Field>

                {/* What happens next */}
                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 10, marginTop: 0, textTransform: "uppercase", letterSpacing: 0.8 }}>What happens next</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { icon: "⚡", text: "Your dashboard is live immediately" },
                      { icon: "📧", text: "Our team gets an automated activation request" },
                      { icon: "✅", text: "Your WhatsApp number goes live within 2 hours" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15 }}>{item.icon}</span>
                        <span style={{ fontSize: 13, color: "#475569" }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <ErrorBox msg={error} />}

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => { setError(""); setStep(1); }} style={styles.backBtn}>← Back</button>
                  <button
                    onClick={handleFinish}
                    disabled={loading}
                    style={{ ...styles.submitBtn, flex: 1, opacity: loading ? 0.75 : 1, cursor: loading ? "wait" : "pointer" }}
                    onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
                  >
                    {loading ? "Setting up your workspace…" : "Launch My Dashboard 🚀"}
                  </button>
                </div>

                <button onClick={handleFinish} disabled={loading} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                  Skip for now — I'll add my number later
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ position: "absolute", bottom: 24, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
          By continuing you agree to our{" "}
          <Link href="/terms" style={{ color: "#64748b", textDecoration: "underline" }}>Terms</Link>{" "}&{" "}
          <Link href="/privacy" style={{ color: "#64748b", textDecoration: "underline" }}>Privacy Policy</Link>.
        </p>
      </main>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      `}</style>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1f2937", marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#b91c1c", fontWeight: 500 }}>
      ❌ {msg}
    </div>
  );
}

// ── Focus helpers ──────────────────────────────────────────────
function focusOn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = G;
  e.currentTarget.style.boxShadow = `0 0 0 4px rgba(37,211,102,0.14)`;
  e.currentTarget.style.background = "#fff";
}
function focusOff(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "#e5e7eb";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.background = "#fafbfc";
}

// ── Styles ─────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", minHeight: "100vh",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    background: "#fff", color: "#111",
  },
  left: {
    flex: "1 1 50%", maxWidth: "52%",
    background: `linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 40%, #ffffff 100%)`,
    padding: "48px 56px",
    display: "flex", alignItems: "center",
    position: "relative", overflow: "hidden",
  },
  leftInner: {
    display: "flex", flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "80vh", width: "100%", maxWidth: 480,
    gap: 40, position: "relative", zIndex: 2,
  },
  heroTitle: {
    fontSize: 38, fontWeight: 800, lineHeight: 1.18,
    letterSpacing: "-0.8px", margin: 0, color: "#0f172a",
  },
  heroSub: { fontSize: 15, color: "#475569", marginTop: 14, marginBottom: 28, lineHeight: 1.65 },
  right: {
    flex: "1 1 48%", padding: "48px 56px",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  formCard: { width: "100%", maxWidth: 440 },
  eyebrow: {
    fontSize: 11, fontWeight: 700, color: GD,
    textTransform: "uppercase" as const, letterSpacing: 1.5,
    margin: "0 0 6px",
  },
  formTitle: {
    fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px",
    margin: "0 0 28px", color: "#0f172a",
  },
  input: {
    width: "100%", padding: "12px 14px",
    background: "#fafbfc", border: "1px solid #e5e7eb",
    borderRadius: 10, fontSize: 14, color: "#0f172a",
    outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const,
    transition: "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
  },
  submitBtn: {
    width: "100%", padding: "14px 16px",
    background: `linear-gradient(135deg, ${G} 0%, ${GD} 100%)`,
    color: "#fff", border: "none", borderRadius: 12,
    fontSize: 15, fontWeight: 700,
    transition: "transform 160ms ease, box-shadow 160ms ease",
    fontFamily: "inherit",
    boxShadow: "0 6px 18px rgba(37,211,102,0.28)",
    letterSpacing: 0.2, cursor: "pointer",
  },
  backBtn: {
    padding: "14px 18px", background: "#f1f5f9",
    border: "1px solid #e5e7eb", borderRadius: 12,
    fontSize: 14, fontWeight: 600, color: "#475569",
    cursor: "pointer", fontFamily: "inherit",
    transition: "background 160ms ease",
    flexShrink: 0,
  },
  successWrap: {
    margin: "auto", textAlign: "center" as const,
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", gap: 16,
  },
  successIcon: { fontSize: 56 },
  successTitle: { fontSize: 30, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" },
  successSub: { fontSize: 15, color: "#64748b", margin: 0 },
  successDots: { display: "flex", gap: 8, marginTop: 8 },
  dot: {
    width: 10, height: 10, borderRadius: "50%",
    background: G, animation: "bounce 1.2s infinite ease-in-out",
  },
};

export default function OnboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <OnboardContent />
    </Suspense>
  );
}
