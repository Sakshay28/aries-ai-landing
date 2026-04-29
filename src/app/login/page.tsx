"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

const G = "#25D366";

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
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 40%, #f8fafb 100%)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background decorative elements */}
      <div style={{
        position: "absolute",
        top: "-200px",
        right: "-200px",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,211,102,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-150px",
        left: "-150px",
        width: "500px",
        height: "500px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,211,102,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "420px", padding: "24px" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", marginBottom: "40px", textDecoration: "none" }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 40 }} />
        </Link>

        {/* Card */}
        <div style={{
          background: "white",
          borderRadius: "20px",
          padding: "40px 36px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid #e5e7eb",
        }}>
          <h1 style={{ fontSize: "26px", fontWeight: 800, marginBottom: "6px", textAlign: "center", color: "#111", letterSpacing: "-0.5px" }}>
            Welcome back
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", textAlign: "center", marginBottom: "32px" }}>
            Log in to your Aries AI dashboard
          </p>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            style={{
              width: "100%",
              marginBottom: "24px",
              padding: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#374151",
              cursor: "pointer",
              transition: "all 200ms ease",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#d1d5db"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
            <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
            <span style={{ fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label style={{ fontSize: "13px", color: "#374151", fontWeight: 600, marginBottom: "6px", display: "block" }}>
                Email address
              </label>
              <input
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#fafbfc",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  fontSize: "14px",
                  color: "#111",
                  outline: "none",
                  transition: "border-color 200ms ease, box-shadow 200ms ease",
                  fontFamily: "inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = G; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(37,211,102,0.12)`; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: "#374151", fontWeight: 600, marginBottom: "6px", display: "block" }}>
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "#fafbfc",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  fontSize: "14px",
                  color: "#111",
                  outline: "none",
                  transition: "border-color 200ms ease, box-shadow 200ms ease",
                  fontFamily: "inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = G; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(37,211,102,0.12)`; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {error && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "#dc2626",
                fontWeight: 500,
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                background: G,
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "all 200ms ease",
                fontFamily: "inherit",
                boxShadow: "0 4px 14px rgba(37,211,102,0.25)",
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(37,211,102,0.35)"; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(37,211,102,0.25)"; }}
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "#6b7280" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: G, fontWeight: 700, textDecoration: "none" }}>
              Start free trial
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "12px", color: "#9ca3af" }}>
          © 2026 Aries AI · WhatsApp Business Automation
        </p>
      </div>
    </div>
  );
}
