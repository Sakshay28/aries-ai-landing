"use client";

import { useState, useEffect, useCallback } from "react";
import Script from "next/script";

// ═══════════════════════════════════════
// 📱 WhatsApp Connection — Meta Embedded Signup
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
  const [manualMode, setManualMode] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/connect");
      if (res.ok) { const data = await res.json(); if (data.success) setStatus(data.data); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void (async () => { await fetchStatus(); })(); }, [fetchStatus]);

  useEffect(() => {
    if (!META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: "v21.0" });
      setSdkLoaded(true);
    };
  }, []);

  function handleEmbeddedSignup() {
    if (!window.FB) { setError("Facebook SDK not loaded. Please refresh."); return; }
    setConnecting(true); setError(null);
    window.FB.login(
      async (response) => {
        if (!response.authResponse?.code) { setConnecting(false); setError("Login cancelled."); return; }
        try {
          const res = await fetch("/api/whatsapp/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: response.authResponse.code }) });
          const data = await res.json();
          if (data.success) { setSuccess("WhatsApp connected! 🎉"); await fetchStatus(); }
          else setError(data.error || "Connection failed");
        } catch { setError("Network error."); }
        finally { setConnecting(false); }
      },
      { config_id: META_CONFIG_ID, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } }
    );
  }

  async function handleManualConnect() {
    if (!manualPhoneId || !manualToken) { setError("Phone Number ID and Access Token are required."); return; }
    setConnecting(true); setError(null);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: manualToken, phone_number_id: manualPhoneId, waba_id: manualWabaId || null, manual: true }) });
      const data = await res.json();
      if (data.success) { setSuccess("WhatsApp connected! 🎉"); await fetchStatus(); setManualMode(false); }
      else setError(data.error || "Connection failed");
    } catch { setError("Network error."); }
    finally { setConnecting(false); }
  }

  const inputStyle = { width: "100%", padding: "12px 14px", background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", color: "#111827", fontFamily: "inherit" as const, outline: "none" };

  if (loading) return <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>⏳ Loading WhatsApp status...</div>;

  return (
    <div style={{ maxWidth: "720px" }}>
      {META_APP_ID && (
        <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" onLoad={() => { if (window.fbAsyncInit) window.fbAsyncInit(); }} />
      )}

      {error && <div style={{ padding: "12px 16px", background: "#fef2f2", borderRadius: "10px", marginBottom: "16px", color: "#dc2626", fontSize: "13px", border: "1px solid #fca5a5" }}>❌ {error}</div>}
      {success && <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: "10px", marginBottom: "16px", color: "#16a34a", fontSize: "13px", border: "1px solid #86efac" }}>✅ {success}</div>}

      {status?.connected ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>✅</div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>WhatsApp Connected</h2>
              <p style={{ color: "#9ca3af", fontSize: "13px" }}>Your bot is live and responding to messages.</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { label: "Phone Number ID", value: status.phone_number_id },
              ...(status.waba_id ? [{ label: "Business Account ID", value: status.waba_id }] : []),
              { label: "Webhook", value: status.webhook_verified ? "✅ Verified" : "⏳ Pending" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#fafbfc", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                <span style={{ color: "#9ca3af", fontSize: "13px" }}>{item.label}</span>
                <span style={{ fontWeight: 600, fontSize: "13px", fontFamily: item.label === "Webhook" ? "inherit" : "monospace", color: item.label === "Webhook" ? (status.webhook_verified ? "#16a34a" : "#d97706") : "#111827" }}>{item.value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "24px", padding: "16px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #dcfce7" }}>
            <p style={{ fontWeight: 700, marginBottom: "6px", fontSize: "14px" }}>📋 Webhook URL</p>
            <code style={{ fontSize: "13px", color: "#6b7280", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp"}
            </code>
            <p style={{ color: "#9ca3af", fontSize: "12px", marginTop: "6px" }}>Set this in Meta App Dashboard → WhatsApp → Configuration → Webhook URL</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "32px", marginBottom: "16px" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>📱</div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "#111827" }}>Connect WhatsApp</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", maxWidth: "400px", margin: "0 auto" }}>
                Connect your WhatsApp Business number to start automating customer conversations with AI.
              </p>
            </div>

            {META_APP_ID && (
              <div style={{ marginBottom: "28px" }}>
                <button onClick={handleEmbeddedSignup} disabled={connecting || !sdkLoaded} style={{
                  width: "100%", padding: "16px", background: "#25D366", border: "none", borderRadius: "12px",
                  color: "white", fontWeight: 700, fontSize: "16px", cursor: connecting ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                  opacity: connecting ? 0.7 : 1, fontFamily: "inherit", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", transition: "all 200ms",
                }}>
                  {connecting ? "⏳ Connecting..." : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.258-.168-2.836.744.744-2.836-.168-.258A8 8 0 1112 20z"/></svg>
                      Connect with WhatsApp
                    </>
                  )}
                </button>
                <p style={{ color: "#9ca3af", fontSize: "12px", textAlign: "center", marginTop: "8px" }}>One-click setup via Meta&apos;s official Embedded Signup</p>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
              <span style={{ color: "#9ca3af", fontSize: "12px", fontWeight: 600 }}>or connect manually</span>
              <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
            </div>

            <button onClick={() => setManualMode(!manualMode)} style={{
              width: "100%", padding: "12px", background: "#fafbfc", border: "1px solid #e5e7eb",
              borderRadius: "10px", color: "#6b7280", cursor: "pointer", fontSize: "14px", fontFamily: "inherit",
            }}>
              {manualMode ? "▼ Hide Manual Setup" : "▶ Manual Setup (API credentials)"}
            </button>
          </div>

          {manualMode && (
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>🔧 Manual Connection</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", color: "#374151", fontSize: "13px", marginBottom: "6px", fontWeight: 600 }}>Phone Number ID *</label>
                  <input type="text" value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                  <p style={{ color: "#9ca3af", fontSize: "12px", marginTop: "4px" }}>Found in Meta Business → WhatsApp → API Setup</p>
                </div>
                <div>
                  <label style={{ display: "block", color: "#374151", fontSize: "13px", marginBottom: "6px", fontWeight: 600 }}>Access Token *</label>
                  <input type="password" value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Your permanent access token" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", color: "#374151", fontSize: "13px", marginBottom: "6px", fontWeight: 600 }}>Business Account ID (optional)</label>
                  <input type="text" value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                </div>
                <button onClick={handleManualConnect} disabled={connecting} style={{
                  padding: "14px", background: "#25D366", border: "none", borderRadius: "10px",
                  color: "white", fontWeight: 700, cursor: "pointer", fontSize: "14px", fontFamily: "inherit",
                }}>
                  {connecting ? "⏳ Connecting..." : "🔗 Connect Manually"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
