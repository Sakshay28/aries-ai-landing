"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { PLAN_DETAILS } from "@/lib/types";

// ═══════════════════════════════════════
// 🚀 Onboarding Wizard
// ═══════════════════════════════════════
// A guided setup for new users to complete their profile,
// connect WhatsApp, and configure their AI bot.
// ═══════════════════════════════════════

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        config: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || "";

const BUSINESS_TYPES = ["Restaurant", "Cafe", "Hotel", "Lounge", "Bar", "Cloud Kitchen", "Event Venue", "Salon", "Spa", "Clinic", "Real Estate", "E-Commerce", "Other"];

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");
  const nameParam = searchParams.get("name");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Business
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Restaurant");
  const [selectedPlan, setSelectedPlan] = useState("starter");

  // Step 2: WhatsApp
  const [connectingWA, setConnectingWA] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Step 3: Bot Settings
  const [botName, setBotName] = useState("Assistant");
  const [botPersonality, setBotPersonality] = useState("friendly and professional");
  const [botMessage, setBotMessage] = useState("Welcome to {business_name}! 🙏 How can I help you today?");

  useEffect(() => {
    if (!META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkLoaded(true);
    };
  }, []);

  async function handleCreateTenant() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessType, plan: selectedPlan }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create tenant");
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleEmbeddedSignup() {
    if (!window.FB) {
      setError("Facebook SDK not loaded. Please try again later.");
      return;
    }

    setConnectingWA(true);
    setError("");

    window.FB.login(
      async (response) => {
        if (!response.authResponse?.code) {
          setConnectingWA(false);
          setError("Login was cancelled or failed.");
          return;
        }

        try {
          const res = await fetch("/api/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: response.authResponse.code }),
          });

          const data = await res.json();
          if (data.success) {
            setWaConnected(true);
            setTimeout(() => setStep(3), 1500);
          } else {
            setError(data.error || "Connection failed");
          }
        } catch {
          setError("Network error. Please try again.");
        } finally {
          setConnectingWA(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }

  async function handleSaveBot() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_name: botName,
          bot_personality: botPersonality,
          welcome_message: botMessage,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save settings");
      
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      {META_APP_ID && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={() => { if (window.fbAsyncInit) window.fbAsyncInit(); }}
        />
      )}

      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "600px", padding: "24px" }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: s <= step ? "var(--primary)" : "var(--border)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div className="glass-card" style={{ padding: "40px" }}>
          
          {/* STEP 1: BUSINESS DETAILS */}
          {step === 1 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>👋</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Welcome, {nameParam?.split(' ')[0] || 'there'}!</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Let&apos;s set up your workspace to get started.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Business Name</label>
                  <input className="input" placeholder="e.g., The Royal Terrace" value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={{ padding: "12px 16px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Business Type</label>
                  <select className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={{ padding: "12px 16px" }}>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Select Plan</label>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {(["starter", "growth"] as const).map((planKey) => {
                      const plan = PLAN_DETAILS[planKey];
                      return (
                        <button key={planKey} onClick={() => setSelectedPlan(planKey)} style={{
                          flex: 1, padding: "16px", borderRadius: "12px", textAlign: "left", cursor: "pointer",
                          background: selectedPlan === planKey ? "rgba(108,92,231,0.1)" : "var(--bg-tertiary)",
                          border: `2px solid ${selectedPlan === planKey ? "var(--primary)" : "var(--border)"}`,
                          transition: "all 0.2s"
                        }}>
                          <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>{plan.name}</div>
                          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>{plan.features[0]}</div>
                          <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>₹{plan.price.toLocaleString()}/mo</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                <button className="btn btn-primary" style={{ padding: "16px", fontSize: "16px", marginTop: "12px" }} onClick={handleCreateTenant} disabled={loading || !businessName}>
                  {loading ? "Saving..." : "Continue →"}
                </button>
              </div>
            </>
          )}

          {/* STEP 2: WHATSAPP CONNECT */}
          {step === 2 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📱</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Connect WhatsApp</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Link your WhatsApp Business account to your bot.</p>
              </div>

              {waConnected ? (
                <div style={{ textAlign: "center", padding: "32px", background: "rgba(0,184,148,0.1)", border: "1px solid rgba(0,184,148,0.3)", borderRadius: "12px" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "16px" }}>✅</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#00B894", marginBottom: "8px" }}>Successfully Connected!</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Moving to the next step...</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ background: "var(--bg-tertiary)", padding: "20px", borderRadius: "12px", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <li>You need a Meta Developer account</li>
                      <li>A valid WhatsApp Business number</li>
                      <li>Meta business verification (optional for sandbox)</li>
                    </ul>
                  </div>

                  {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                  <button 
                    onClick={handleEmbeddedSignup} 
                    disabled={connectingWA || !sdkLoaded || !META_APP_ID}
                    style={{
                      width: "100%", padding: "16px", background: "#25D366", border: "none",
                      borderRadius: "12px", color: "white", fontWeight: 700, fontSize: "16px",
                      cursor: connectingWA ? "wait" : "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: "12px", opacity: connectingWA || !sdkLoaded ? 0.7 : 1,
                    }}
                  >
                    {connectingWA ? "⏳ Connecting..." : "Connect with Meta"}
                  </button>

                  <button onClick={() => setStep(3)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", marginTop: "8px" }}>
                    Skip for now (I&apos;ll do this later)
                  </button>
                </div>
              )}
            </>
          )}

          {/* STEP 3: BOT SETUP */}
          {step === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🤖</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Personalize Your Bot</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Give your AI assistant a personality.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Bot Name</label>
                  <input className="input" placeholder="e.g., Maya, Aria, Assistant" value={botName} onChange={(e) => setBotName(e.target.value)} style={{ padding: "12px 16px" }} />
                </div>
                
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Bot Personality</label>
                  <select className="input" value={botPersonality} onChange={(e) => setBotPersonality(e.target.value)} style={{ padding: "12px 16px" }}>
                    <option value="professional">Professional & Formal</option>
                    <option value="friendly and professional">Friendly & Approachable</option>
                    <option value="casual and fun">Casual & Fun</option>
                    <option value="elegant and exclusive">Elegant & Luxurious</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Welcome Message</label>
                  <textarea className="input" value={botMessage} onChange={(e) => setBotMessage(e.target.value)} rows={3} style={{ padding: "12px 16px", resize: "vertical" }} />
                </div>

                {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                <button className="btn btn-accent" style={{ padding: "16px", fontSize: "16px", marginTop: "12px" }} onClick={handleSaveBot} disabled={loading}>
                  {loading ? "Finishing up..." : "Complete Setup 🎉"}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gradient-hero)" }}><div className="spinner">Loading...</div></div>}>
      <OnboardContent />
    </Suspense>
  );
}
