"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, getEnvDiagnostics } from "@/lib/env";

// ═══════════════════════════════════════════════════════════════
// 🔐 Login — premium split-pane with Google OAuth + email/password
// Left panel: brand + proof.  Right panel: auth form.
// Built to feel more polished than AiSensy's login.
// ═══════════════════════════════════════════════════════════════

const G = "#25D366";
const GD = "#128C7E";

function LoginInner() {
  const params = useSearchParams();
  const urlError = params.get("error");
  const urlMessage = params.get("message");
  const prefillEmail = params.get("email") || "";
  const initialError =
    urlError === "auth_failed" ? "Google sign-in failed. Please try again."
    : urlError === "signup_failed" ? "We couldn't create your account. Please try again or contact support."
    : "";
  const initialSuccess =
    urlMessage === "account_created" ? "Account created! Sign in below to continue to your dashboard."
    : "";

  const [email, setEmail] = useState(prefillEmail);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [gsiActive, setGsiActive] = useState(false);

  // OTP Login States
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    // Hidden developer diagnostics in the browser console
    const diagnostics = getEnvDiagnostics();
    if (!diagnostics.isValid) {
      console.warn(
        `%c⚠️ ARIES AI AUTHENTICATION DIAGNOSTICS:
[ ] Supabase URL loaded: ${diagnostics.supabaseUrlLoaded ? '✅' : '❌'}
[ ] Anon key loaded: ${diagnostics.anonKeyLoaded ? '✅' : '❌'}
Please verify your production environment variables in your deployment dashboard.`,
        'color: #e11d48; font-weight: bold; font-size: 13px;'
      );
    }
  }, []);

  // Google GSI Loader & Initializer
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if ((window as any).google) {
        try {
          (window as any).google.accounts.id.initialize({
            client_id: "355762885137-ta29hfdtbrs0sl2a22cosps57rroi07c.apps.googleusercontent.com",
            callback: handleGoogleCredentialResponse,
          });

          (window as any).google.accounts.id.renderButton(
            document.getElementById("google-signin-btn-overlay"),
            {
              type: "standard",
              theme: "outline",
              size: "large",
              text: "continue_with",
              shape: "rectangular",
              logo_alignment: "left",
              width: "420",
            }
          );
          
          // Google button rendered successfully, mark GSI auth as active
          setGsiActive(true);
        } catch (err) {
          console.error("Failed to initialize Google Auth SDK:", err);
        }
      }
    };

    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {
        // Safe fail if script already removed
      }
    };
  }, []);

  async function handleGoogleFallback() {
    if (!isSupabaseConfigured) {
      setError("Authentication setup incomplete. Please contact support or try again shortly.");
      return;
    }
    setGoogleLoading(true);
    setError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/api/auth/callback` },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in redirect failed.");
      setGoogleLoading(false);
    }
  }

  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response?.credential) return;
    setGoogleLoading(true);
    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });

      if (authError) throw authError;

      const sessionUser = authData?.session?.user;
      if (!sessionUser) {
        throw new Error("No user session created. Please try again.");
      }

      // Provision user and tenant in our public database
      const fullName = sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || sessionUser.email?.split("@")[0] || "User";
      const businessName = fullName ? `${fullName.split(" ")[0]}'s Business` : "My Business";

      const provisionRes = await fetch("/api/auth/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: sessionUser.email,
          fullName,
          businessName,
          authId: sessionUser.id,
        }),
      });

      const provisionData = await provisionRes.json();
      if (!provisionData.success) {
        throw new Error(provisionData.error || "Failed to provision workspace");
      }

      if (provisionData.message === "Already provisioned") {
        window.location.replace("/dashboard");
      } else {
        window.location.replace("/onboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError("Authentication setup incomplete. Please contact support or try again shortly.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        }
      });
      if (otpError) throw otpError;
      setOtpSent(true);
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token: otpCode,
          type: "email",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Verification failed");
      }
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please check and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      {/* ── LEFT PANE: brand + value ──────────────────────────── */}
      <aside style={styles.left}>
        <div style={styles.leftInner}>
          <Link href="/" style={styles.logoWrap}>
            <img src="/logo.png" alt="Aries AI" style={{ height: 38 }} />
          </Link>

          <div>
            <h1 style={styles.heroTitle}>
              Welcome back to <span style={{ color: G }}>Aries AI</span>
            </h1>
            <p style={styles.heroSub}>
              Your WhatsApp + Voice AI control room. Log in to pick up where you left off.
            </p>

            <ul style={styles.featureList}>
              <Feature icon="💬" title="Live conversations" text="Every WhatsApp chat, one inbox." />
              <Feature icon="📞" title="AI voice calling" text="Outbound demos in Hindi, English + regional." />
              <Feature icon="📊" title="Lead scoring" text="Hot, warm, cold — updated in real time." />
            </ul>
          </div>

          <div style={styles.trustRow}>
            <span style={styles.trustDot} />
            <span style={styles.trustText}>Trusted by Indian D2C, clinics, real estate & hospitality teams</span>
          </div>
        </div>
      </aside>

      {/* ── RIGHT PANE: form ──────────────────────────────────── */}
      <main style={styles.right}>
        {/* Top-right signup link */}
        <div style={styles.topRight}>
          Not a member yet?{" "}
          <Link href="/signup" style={{ color: G, fontWeight: 700, textDecoration: "none" }}>
            Sign up
          </Link>
        </div>

        <div style={styles.formCard}>
          <p style={styles.eyebrow}>Welcome back</p>
          <h2 style={styles.formTitle}>Log in to Aries AI</h2>

          {/* Google OAuth */}
          <div style={{ position: "relative", width: "100%" }}>
            <button
              type="button"
              onClick={handleGoogleFallback}
              disabled={googleLoading}
              style={{ ...styles.googleBtn, opacity: googleLoading ? 0.7 : 1, cursor: googleLoading ? "wait" : "pointer", width: "100%" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
            >
              <GoogleIcon />
              <span>{googleLoading ? "Connecting..." : "Continue with Google"}</span>
            </button>
            <div
              id="google-signin-btn-overlay"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
                overflow: "hidden",
                zIndex: 10,
                display: gsiActive ? "block" : "none",
                pointerEvents: gsiActive ? "auto" : "none",
              }}
            />
          </div>

          <div style={styles.dividerRow}>
            <div style={styles.divider} />
            <span style={styles.dividerText}>OR</span>
            <div style={styles.divider} />
          </div>

          {!otpSent ? (
            <form onSubmit={sendOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Labelled label="Email address">
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

              {initialSuccess && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#15803d", marginBottom: 4 }}>{initialSuccess}</div>}
              {error && (
                <div style={styles.errorBox}>
                  {error.toLowerCase().includes("rate limit") ? (
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Email Rate Limit Exceeded</div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.95 }}>
                        Supabase restricts how frequently verification emails can be sent. To continue testing immediately, we recommend setting up a <strong>Test OTP</strong>:
                        <ol style={{ margin: "6px 0 0 16px", padding: 0 }}>
                          <li>Go to your <strong>Supabase Dashboard &rarr; Authentication &rarr; Providers &rarr; Email</strong>.</li>
                          <li>Scroll to <strong>Test OTPs</strong> and add a new entry (e.g., <code>test@ariesai.in</code> with OTP <code>12345678</code>).</li>
                          <li>Try signing in with that test email. It will bypass SMTP rate limits and log you in instantly!</li>
                        </ol>
                      </div>
                    </div>
                  ) : error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.submitBtn,
                  opacity: loading ? 0.75 : 1,
                  cursor: loading ? "wait" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 10px 28px rgba(37,211,102,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(37,211,102,0.28)";
                }}
              >
                {loading ? "Sending OTP..." : "Send Verification Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#15803d", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 700 }}>OTP Code Sent!</span>
                <span style={{ opacity: 0.9 }}>Enter the 8-digit code sent to {email}.</span>
              </div>

              <Labelled label="Enter 8-digit code">
                <input
                  type="text"
                  maxLength={8}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="00000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  style={{ ...styles.input, textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                  onFocus={(e) => focusOn(e)}
                  onBlur={(e) => focusOff(e)}
                />
              </Labelled>

              {error && <div style={styles.errorBox}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.submitBtn,
                  opacity: loading ? 0.75 : 1,
                  cursor: loading ? "wait" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 10px 28px rgba(37,211,102,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(37,211,102,0.28)";
                }}
              >
                {loading ? "Verifying..." : "Verify & Log in"}
              </button>

              <div style={{ textAlign: "center", marginTop: 8 }}>
                {countdown > 0 ? (
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Resend code in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={loading}
                    style={{ background: "none", border: "none", color: GD, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
                  >
                    Resend code
                  </button>
                )}
                <span style={{ margin: "0 8px", color: "#e2e8f0" }}>|</span>
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtpCode(""); setError(""); }}
                  style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0 }}
                >
                  Change email
                </button>
              </div>
            </form>
          )}
        </div>

        <p style={styles.legal}>
          By continuing you agree to our{" "}
          <Link href="/terms" style={styles.legalLink}>Terms</Link> &{" "}
          <Link href="/privacy" style={styles.legalLink}>Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <LoginInner />
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
    gap: 48,
    position: "relative",
    zIndex: 2,
  },
  logoWrap: { display: "inline-flex", alignItems: "center", textDecoration: "none" },
  heroTitle: {
    fontSize: 42,
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: "-0.8px",
    margin: 0,
    color: "#0f172a",
  },
  heroSub: { fontSize: 16, color: "#475569", marginTop: 16, marginBottom: 32, lineHeight: 1.6 },
  featureList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 },
  featureItem: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.7)",
    borderRadius: 12,
    border: "1px solid rgba(16,185,129,0.15)",
    backdropFilter: "blur(6px)",
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff",
    fontSize: 18,
    flexShrink: 0,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  featureTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  featureText: { fontSize: 13, color: "#64748b", marginTop: 2 },
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
  },
  topRight: {
    position: "absolute",
    top: 32, right: 48,
    fontSize: 14, color: "#64748b",
  },
  formCard: {
    width: "100%",
    maxWidth: 420,
  },
  eyebrow: {
    fontSize: 11, fontWeight: 700, color: GD,
    textTransform: "uppercase", letterSpacing: 1.5,
    marginBottom: 6, marginTop: 0,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    margin: 0,
    marginBottom: 28,
    color: "#0f172a",
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
    transition: "transform 160ms ease, box-shadow 160ms ease",
    fontFamily: "inherit",
    boxShadow: "0 6px 18px rgba(37,211,102,0.28)",
    letterSpacing: 0.2,
  },
  forgotLink: { fontSize: 13, color: "#64748b", textDecoration: "none", fontWeight: 500 },
  legal: {
    position: "absolute",
    bottom: 24,
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
  },
  legalLink: { color: "#64748b", textDecoration: "underline" },
};
