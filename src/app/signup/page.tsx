"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

// ═══════════════════════════════════════════════════════════════
// 🚀 Signup — single-page split-pane with Google OAuth + form
// Collects just enough to launch a tenant (name, business, email,
// password) then drops the user straight into /dashboard. No multi-
// step wizard, no plan picker (they upgrade from /dashboard/billing).
// ═══════════════════════════════════════════════════════════════

const G = "#25D366";
const GD = "#128C7E";

function SignupInner() {
  const params = useSearchParams();
  const urlError = params.get("error");
  // Brand attribution: ?brand=libra on the signup link, or detect from host
  const brand = (params.get("brand") === "libra"
    || (typeof window !== "undefined" && /libra/i.test(window.location.host)))
    ? "libra" : "aries";
  const initialError =
    urlError === "auth_failed" ? "Google sign-up failed. Please try again."
    : urlError === "signup_failed" ? "We couldn't create your account. Please try again."
    : "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleGoogle() {
    if (!isSupabaseConfigured) {
      setError("Authentication is not configured yet. Set Supabase env vars first.");
      return;
    }
    setGoogleLoading(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // The callback auto-provisions the tenant and drops straight into /dashboard.
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // 1) Create the auth user + tenant via our server route.
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          businessName,
          businessType: "Other",
          plan: "starter",
          brand,
        }),
      });
      const signupData = await signupRes.json();
      if (!signupData.success) throw new Error(signupData.error || "Signup failed");

      // 2) Auto-login so the session cookies land on this device.
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginData.success) {
        throw new Error(
          "Account created but auto-login failed. Please sign in manually from the login page."
        );
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
    }
  }

  const canSubmit =
    fullName.trim().length >= 2 &&
    email.includes("@") &&
    businessName.trim().length >= 2 &&
    password.length >= 8 &&
    !loading;

  return (
    <div style={styles.root}>
      {/* ── LEFT PANE: value prop ─────────────────────────────── */}
      <aside style={styles.left}>
        <div style={styles.leftInner}>
          <Link href="/" style={styles.logoWrap}>
            <img src="/logo.png" alt="Aries AI" style={{ height: 38 }} />
          </Link>

          <div>
            <h1 style={styles.heroTitle}>
              Turn every message into a{" "}
              <span style={{ color: G }}>paying customer</span>
            </h1>
            <p style={styles.heroSub}>
              Aries AI replies on WhatsApp, picks up missed calls in Hindi + English, books
              appointments automatically, and keeps your lead pipeline alive 24/7.
            </p>

            <div style={styles.perkHero}>
              <div style={styles.perkIcon}>🎁</div>
              <div>
                <div style={styles.perkTitle}>14-day free trial</div>
                <div style={styles.perkText}>No credit card required. Cancel any time.</div>
              </div>
            </div>

            <ul style={styles.featureList}>
              <Feature icon="💬" title="WhatsApp Business API" text="Instant verification & setup with Meta." />
              <Feature icon="📞" title="AI voice calling" text="Indian-accent Hindi, English, Tamil, Telugu + more." />
              <Feature icon="📊" title="Leads & analytics" text="Every chat scored. Every booking tracked." />
            </ul>
          </div>

          <div style={styles.trustRow}>
            <span style={styles.trustDot} />
            <span style={styles.trustText}>Built for Indian D2C, restaurants, clinics & real-estate teams</span>
          </div>
        </div>
      </aside>

      {/* ── RIGHT PANE: form ──────────────────────────────────── */}
      <main style={styles.right}>
        <div style={styles.topRight}>
          Already a member?{" "}
          <Link href="/login" style={{ color: G, fontWeight: 700, textDecoration: "none" }}>
            Log in
          </Link>
        </div>

        <div style={styles.formCard}>
          <h2 style={styles.formTitle}>Create your Aries AI account</h2>
          <p style={styles.formSub}>
            Fill in the details below to launch your free 14-day trial.
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            style={{ ...styles.googleBtn, opacity: googleLoading ? 0.7 : 1, cursor: googleLoading ? "wait" : "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
          >
            <GoogleIcon />
            <span>{googleLoading ? "Connecting..." : "Sign up with Google"}</span>
          </button>

          <div style={styles.dividerRow}>
            <div style={styles.divider} />
            <span style={styles.dividerText}>OR</span>
            <div style={styles.divider} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Labelled label="Full name">
              <input
                type="text"
                placeholder="Ravi Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
                style={styles.input}
                onFocus={(e) => focusOn(e)}
                onBlur={(e) => focusOff(e)}
              />
            </Labelled>

            <Labelled label="Work email">
              <input
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={styles.input}
                onFocus={(e) => focusOn(e)}
                onBlur={(e) => focusOff(e)}
              />
            </Labelled>

            <Labelled label="Business name">
              <input
                type="text"
                placeholder="The Royal Terrace"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                minLength={2}
                autoComplete="organization"
                style={styles.input}
                onFocus={(e) => focusOn(e)}
                onBlur={(e) => focusOff(e)}
              />
            </Labelled>

            <Labelled
              label="Password"
              right={
                <button type="button" onClick={() => setShowPw((s) => !s)} style={styles.showPwBtn}>
                  {showPw ? "Hide" : "Show"}
                </button>
              }
            >
              <input
                type={showPw ? "text" : "password"}
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                style={styles.input}
                onFocus={(e) => focusOn(e)}
                onBlur={(e) => focusOff(e)}
              />
            </Labelled>

            {error && <div style={styles.errorBox}>{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.submitBtn,
                opacity: canSubmit ? 1 : 0.6,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => {
                if (canSubmit) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 10px 28px rgba(37,211,102,0.4)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(37,211,102,0.28)";
              }}
            >
              {loading ? "Creating your account..." : "Start free trial"}
            </button>
          </form>

          <p style={styles.legal}>
            By signing up you agree to our{" "}
            <Link href="/terms" style={styles.legalLink}>Terms</Link> &{" "}
            <Link href="/privacy" style={styles.legalLink}>Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <SignupInner />
    </Suspense>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <li style={styles.featureItem}>
      <div style={styles.featureIcon}>{icon}</div>
      <div>
        <div style={styles.featureTitle}>{title}</div>
        <div style={styles.featureText}>{text}</div>
      </div>
    </li>
  );
}

function Labelled({
  label,
  right,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={styles.labelRow}>
        <span style={styles.labelText}>{label}</span>
        {right}
      </div>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = G;
  e.currentTarget.style.boxShadow = `0 0 0 4px rgba(37,211,102,0.14)`;
  e.currentTarget.style.background = "#fff";
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#e5e7eb";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.background = "#fafbfc";
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    background: "#fff",
    color: "#111",
  },
  left: {
    flex: "1 1 50%",
    maxWidth: "55%",
    background: `linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 40%, #ffffff 100%)`,
    padding: "48px 56px",
    display: "flex",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  leftInner: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "80vh",
    width: "100%",
    maxWidth: 480,
    gap: 36,
    position: "relative",
    zIndex: 2,
  },
  logoWrap: { display: "inline-flex", alignItems: "center", textDecoration: "none" },
  heroTitle: {
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: "-0.8px",
    margin: 0,
    color: "#0f172a",
  },
  heroSub: { fontSize: 15, color: "#475569", marginTop: 16, marginBottom: 24, lineHeight: 1.65 },
  perkHero: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: `linear-gradient(135deg, ${G} 0%, ${GD} 100%)`,
    color: "#fff",
    padding: "14px 18px",
    borderRadius: 12,
    marginBottom: 24,
    boxShadow: "0 8px 20px rgba(37,211,102,0.3)",
  },
  perkIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.25)",
    fontSize: 18,
    flexShrink: 0,
  },
  perkTitle: { fontSize: 14, fontWeight: 700 },
  perkText: { fontSize: 12, opacity: 0.95, marginTop: 2 },
  featureList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 },
  featureItem: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.7)",
    borderRadius: 12,
    border: "1px solid rgba(16,185,129,0.15)",
    backdropFilter: "blur(6px)",
  },
  featureIcon: {
    width: 34, height: 34, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff",
    fontSize: 16,
    flexShrink: 0,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  featureTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  featureText: { fontSize: 12.5, color: "#64748b", marginTop: 2 },
  trustRow: { display: "flex", alignItems: "center", gap: 10 },
  trustDot: {
    display: "inline-block",
    width: 8, height: 8, borderRadius: "50%",
    background: G,
    boxShadow: `0 0 0 4px rgba(37,211,102,0.2)`,
  },
  trustText: { fontSize: 12, color: "#475569", fontWeight: 500 },

  right: {
    flex: "1 1 45%",
    padding: "48px 56px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflowY: "auto",
  },
  topRight: {
    position: "absolute",
    top: 32, right: 48,
    fontSize: 14, color: "#64748b",
  },
  formCard: {
    width: "100%",
    maxWidth: 440,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    margin: 0,
    marginBottom: 8,
    color: "#0f172a",
  },
  formSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 0,
    marginBottom: 24,
  },
  googleBtn: {
    width: "100%",
    padding: "13px 16px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    color: "#1f2937",
    transition: "all 160ms ease",
    fontFamily: "inherit",
  },
  dividerRow: { display: "flex", alignItems: "center", gap: 16, margin: "22px 0" },
  divider: { flex: 1, height: 1, background: "#e5e7eb" },
  dividerText: { fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: 1.5 },
  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  labelText: { fontSize: 13, color: "#1f2937", fontWeight: 600 },
  input: {
    width: "100%",
    padding: "12px 14px",
    background: "#fafbfc",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 14,
    color: "#0f172a",
    outline: "none",
    transition: "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  showPwBtn: {
    background: "transparent", border: "none", color: GD,
    fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    color: "#b91c1c",
    fontWeight: 500,
  },
  submitBtn: {
    width: "100%",
    padding: "14px 16px",
    background: `linear-gradient(135deg, ${G} 0%, ${GD} 100%)`,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    transition: "transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
    fontFamily: "inherit",
    boxShadow: "0 6px 18px rgba(37,211,102,0.28)",
    letterSpacing: 0.2,
    marginTop: 4,
  },
  legal: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 0,
  },
  legalLink: { color: "#64748b", textDecoration: "underline" },
};
