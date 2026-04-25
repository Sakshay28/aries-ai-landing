"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Script from "next/script";

// ═══════════════════════════════════════
// 📱 WhatsApp Connection — Meta Embedded Signup
// ═══════════════════════════════════════
// Uses Meta's official Embedded Signup SDK for one-click
// WhatsApp Business API connection. No manual token entry.
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

interface ConnectionStatus {
  connected: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verified: boolean;
  onboarding_completed: boolean;
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || "";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Manual connection fields (fallback)
  const [manualMode, setManualMode] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStatus(data.data);
      }
    } catch {
      // Ignore — will show setup flow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Initialize Facebook SDK
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

  // ── Embedded Signup Flow ──
  function handleEmbeddedSignup() {
    if (!window.FB) {
      setError("Facebook SDK not loaded. Please refresh the page.");
      return;
    }

    setConnecting(true);
    setError(null);

    window.FB.login(
      async (response) => {
        if (!response.authResponse?.code) {
          setConnecting(false);
          setError("Login was cancelled or failed. Please try again.");
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
            setSuccess("WhatsApp connected successfully! 🎉");
            await fetchStatus();
          } else {
            setError(data.error || "Connection failed");
          }
        } catch {
          setError("Network error. Please try again.");
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  // ── Manual Connection ──
  async function handleManualConnect() {
    if (!manualPhoneId || !manualToken) {
      setError("Phone Number ID and Access Token are required.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: manualToken, // Token used directly
          phone_number_id: manualPhoneId,
          waba_id: manualWabaId || null,
          manual: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess("WhatsApp connected successfully! 🎉");
        await fetchStatus();
        setManualMode(false);
      } else {
        setError(data.error || "Connection failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "0.9rem",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)" }}>
        ⏳ Loading WhatsApp status...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Facebook SDK Script */}
      {META_APP_ID && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={() => {
            if (window.fbAsyncInit) window.fbAsyncInit();
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📱 WhatsApp Connection</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Connect your WhatsApp Business number to start automating.</p>
        </header>

        <div style={{ padding: "2rem", maxWidth: "700px" }}>
          {/* Status Messages */}
          {error && (
            <div style={{ padding: "1rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#E17055", fontSize: "0.9rem" }}>
              ❌ {error}
            </div>
          )}
          {success && (
            <div style={{ padding: "1rem", background: "rgba(0, 184, 148, 0.1)", border: "1px solid rgba(0, 184, 148, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#00B894", fontSize: "0.9rem" }}>
              ✅ {success}
            </div>
          )}

          {/* Connected State */}
          {status?.connected ? (
            <div className="glass-card" style={{ padding: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "rgba(0, 184, 148, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>✅</div>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>WhatsApp Connected</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Your bot is live and responding to messages.</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Phone Number ID</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", fontFamily: "monospace" }}>{status.phone_number_id}</span>
                </div>
                {status.waba_id && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Business Account ID</span>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem", fontFamily: "monospace" }}>{status.waba_id}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Webhook</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: status.webhook_verified ? "#00B894" : "#FDCB6E" }}>
                    {status.webhook_verified ? "✅ Verified" : "⏳ Pending"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(108, 92, 231, 0.08)", borderRadius: "8px", border: "1px solid rgba(108, 92, 231, 0.2)" }}>
                <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>📋 Webhook URL</p>
                <code style={{ fontSize: "0.8rem", color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp"}
                </code>
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  Set this URL in your Meta App Dashboard → WhatsApp → Configuration → Webhook URL
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Not Connected — Show setup options */}
              <div className="glass-card" style={{ padding: "2rem", marginBottom: "1.5rem" }}>
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📱</div>
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.5rem" }}>Connect WhatsApp</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto" }}>
                    Connect your WhatsApp Business number to start automating customer conversations with AI.
                  </p>
                </div>

                {/* One-Click Embedded Signup */}
                {META_APP_ID && (
                  <div style={{ marginBottom: "2rem" }}>
                    <button
                      onClick={handleEmbeddedSignup}
                      disabled={connecting || !sdkLoaded}
                      style={{
                        width: "100%", padding: "1rem", background: "#25D366", border: "none",
                        borderRadius: "12px", color: "white", fontWeight: 700, fontSize: "1rem",
                        cursor: connecting ? "wait" : "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: "0.75rem", opacity: connecting ? 0.7 : 1,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {connecting ? (
                        "⏳ Connecting..."
                      ) : (
                        <>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.258-.168-2.836.744.744-2.836-.168-.258A8 8 0 1112 20z"/>
                          </svg>
                          Connect with WhatsApp
                        </>
                      )}
                    </button>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "0.75rem" }}>
                      One-click setup via Meta&apos;s official Embedded Signup
                    </p>
                  </div>
                )}

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>or connect manually</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                </div>

                {/* Manual Toggle */}
                <button onClick={() => setManualMode(!manualMode)} style={{
                  width: "100%", padding: "0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                  borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.9rem",
                }}>
                  {manualMode ? "▼ Hide Manual Setup" : "▶ Manual Setup (API credentials)"}
                </button>
              </div>

              {/* Manual Mode Form */}
              {manualMode && (
                <div className="glass-card" style={{ padding: "2rem" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>🔧 Manual Connection</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Phone Number ID *
                      </label>
                      <input type="text" value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                      <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.25rem" }}>Found in Meta Business → WhatsApp → API Setup</p>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Access Token *
                      </label>
                      <input type="password" value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Your permanent access token" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Business Account ID (optional)
                      </label>
                      <input type="text" value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                    </div>
                    <button onClick={handleManualConnect} disabled={connecting} style={{
                      padding: "0.75rem", background: "var(--gradient-primary)", border: "none",
                      borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem",
                    }}>
                      {connecting ? "⏳ Connecting..." : "🔗 Connect Manually"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
