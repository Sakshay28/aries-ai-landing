"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PLAN_DETAILS } from "@/lib/types";

type Step = 1 | 2 | 3;

export default function SignupPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Step 2 fields
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Restaurant");

  // Step 3 fields
  const [selectedPlan, setSelectedPlan] = useState("starter");

  async function handleGoogleSignup() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/onboard` },
    });
  }

  async function handleSubmit() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, fullName, businessName, businessType, plan: selectedPlan,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Auto-login via our API route (sets session cookies server-side)
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginData.success) throw new Error("Account created but login failed. Please log in manually.");

      // Session cookies set by server — redirect
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
    }
  }

  const businessTypes = ["Restaurant", "Cafe", "Hotel", "Lounge", "Bar", "Cloud Kitchen", "Event Venue", "Salon", "Spa", "Clinic", "Real Estate", "E-Commerce", "Other"];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "500px", padding: "24px" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", marginBottom: "40px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "12px",
            background: "var(--gradient-primary)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "20px"
          }}>⚡</div>
          <span style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" }}>
            Project <span className="text-gradient">Bolt</span>
          </span>
        </Link>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: s <= step ? "var(--primary)" : "var(--border)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div className="glass-card" style={{ padding: "36px" }}>
          {/* Step 1: Account */}
          {step === 1 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Create your account</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                Start your 14-day free trial. No credit card needed.
              </p>

              <button onClick={handleGoogleSignup} className="btn btn-secondary" style={{ width: "100%", marginBottom: "24px", padding: "14px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Sign up with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Full Name</label>
                  <input className="input" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Email</label>
                  <input className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Password</label>
                  <input className="input" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", padding: "14px" }}
                  onClick={() => { if (email && password && fullName) setStep(2); else setError("Please fill all fields"); }}
                  disabled={!email || !password || !fullName}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Business */}
          {step === 2 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Tell us about your business</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                We&apos;ll customize your AI assistant based on this.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Business Name</label>
                  <input className="input" placeholder="e.g., The Royal Terrace" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Business Type</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    {businessTypes.map((type) => (
                      <button key={type} onClick={() => setBusinessType(type)}
                        style={{
                          padding: "10px 8px", borderRadius: "var(--radius-md)", fontSize: "13px",
                          background: businessType === type ? "var(--primary)" : "var(--bg-secondary)",
                          color: businessType === type ? "white" : "var(--text-secondary)",
                          border: `1px solid ${businessType === type ? "var(--primary)" : "var(--border)"}`,
                          transition: "all 0.2s", fontWeight: businessType === type ? 600 : 400,
                        }}>{type}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: "14px" }} onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 2, padding: "14px" }}
                    onClick={() => { if (businessName) setStep(3); }}
                    disabled={!businessName}>
                    Continue →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Plan */}
          {step === 3 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Choose your plan</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                Start free for 14 days. Upgrade or cancel anytime.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(["starter", "growth", "pro"] as const).map((planKey) => {
                  const plan = PLAN_DETAILS[planKey];
                  const isSelected = selectedPlan === planKey;
                  return (
                    <button key={planKey} onClick={() => setSelectedPlan(planKey)}
                      style={{
                        padding: "16px 20px", borderRadius: "var(--radius-md)", textAlign: "left",
                        background: isSelected ? "rgba(108,92,231,0.1)" : "var(--bg-secondary)",
                        border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                        transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
                          {plan.name} {planKey === "growth" && <span className="badge badge-primary" style={{ fontSize: "10px", marginLeft: "8px" }}>POPULAR</span>}
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                          {plan.features.slice(0, 2).join(" · ")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>₹{plan.price.toLocaleString()}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>/month</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div style={{
                  background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)",
                  borderRadius: "var(--radius-md)", padding: "10px 14px", marginTop: "16px",
                  fontSize: "13px", color: "var(--danger)",
                }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button className="btn btn-secondary" style={{ flex: 1, padding: "14px" }} onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-accent" style={{ flex: 2, padding: "14px" }}
                  onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating your account..." : "Start Free Trial 🚀"}
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--text-secondary)" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--primary-light)", fontWeight: 600 }}>Log in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
