"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Session cookies are set by the server — just redirect
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
    });
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      {/* Background mesh */}
      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "440px", padding: "24px" }}>
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

        {/* Card */}
        <div className="glass-card" style={{ padding: "36px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px", textAlign: "center" }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", textAlign: "center", marginBottom: "32px" }}>
            Log in to your dashboard
          </p>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            className="btn btn-secondary"
            style={{ width: "100%", marginBottom: "24px", padding: "14px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px",
          }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>
                Email
              </label>
              <input
                type="email" className="input" placeholder="you@business.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>
                Password
              </label>
              <input
                type="password" className="input" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)",
                borderRadius: "var(--radius-md)", padding: "10px 14px",
                fontSize: "13px", color: "var(--danger)",
              }}>{error}</div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "14px" }} disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--text-secondary)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "var(--primary-light)", fontWeight: 600 }}>
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
