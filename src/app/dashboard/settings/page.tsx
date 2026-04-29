"use client";

import { useState, useEffect, useCallback } from "react";


// ═══════════════════════════════════════
// 🤖 Bot Settings — Now saves to Supabase!
// ═══════════════════════════════════════
// Fetches config from /api/dashboard/settings on load.
// Saves changes back to Supabase via PATCH.
// ═══════════════════════════════════════

interface BotConfig {
  business_name: string;
  business_type: string;
  welcome_message: string;
  bot_name: string;
  bot_personality: string;
  business_phone: string;
  business_address: string;
  business_website: string;
  business_email: string;
  welcome_offer: string;
  usps: string[];
  working_hours: Record<string, string>;
  off_hours_message: string;
  staff_phone: string;
  staff_name: string;
  manager_phone: string;
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;
  hot_keywords: string[];
  warm_keywords: string[];
  custom_faqs: Array<{ question: string; answer: string }>;
  off_hours_capture_lead: boolean;
}

const DEFAULT_CONFIG: BotConfig = {
  business_name: "",
  business_type: "restaurant",
  welcome_message: "Welcome to {business_name}! 🙏 How can I help you today?",
  bot_name: "Assistant",
  bot_personality: "friendly and professional",
  business_phone: "",
  business_address: "",
  business_website: "",
  business_email: "",
  welcome_offer: "",
  usps: [],
  working_hours: { "mon-fri": "09:00-22:00", "sat-sun": "10:00-23:00" },
  off_hours_message: "We're currently closed. We'll get back to you when we open! 🌙",
  staff_phone: "",
  staff_name: "",
  manager_phone: "",
  followup_30min: true,
  followup_3hr: true,
  followup_24hr: true,
  followup_7day: false,
  escalation_timeout_mins: 30,
  hot_keywords: ["today", "tonight", "now", "book", "reserve"],
  warm_keywords: ["interested", "looking", "when", "available"],
  custom_faqs: [],
  off_hours_capture_lead: true,
};

const PERSONALITY_OPTIONS = [
  { value: "professional", label: "Professional", icon: "👔", desc: "Formal, polished, corporate tone" },
  { value: "friendly and professional", label: "Friendly", icon: "😊", desc: "Warm, approachable, conversational" },
  { value: "casual and fun", label: "Casual", icon: "✌️", desc: "Relaxed, uses emoji, fun" },
  { value: "elegant and exclusive", label: "Luxury", icon: "✨", desc: "Elegant, exclusive, premium feel" },
];

export default function BotSettingsPage() {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/settings");
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setConfig({ ...DEFAULT_CONFIG, ...data.data });
      }
    } catch (err) {
      console.error("Settings fetch error:", err);
      // Don't set error — just use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleTest() {
    if (!testMessage.trim()) return;
    const responses: Record<string, string> = {
      "hi": `Welcome to ${config.business_name}! 🙏 How can I help you today?`,
      "menu": "Here's our menu! We have a wide selection. Would you like to see our special recommendations? 🍽️",
      "book": `I'd love to help you with a reservation at ${config.business_name}! For how many guests and when? 📅`,
    };
    const key = Object.keys(responses).find(k => testMessage.toLowerCase().includes(k));
    setTestResponse(key ? responses[key] : `Thank you for reaching out to ${config.business_name}! Let me help you with that.`);
  }

  function addFaq() {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    setConfig(prev => ({
      ...prev,
      custom_faqs: [...prev.custom_faqs, { question: newFaqQ.trim(), answer: newFaqA.trim() }],
    }));
    setNewFaqQ("");
    setNewFaqA("");
  }

  function removeFaq(index: number) {
    setConfig(prev => ({
      ...prev,
      custom_faqs: prev.custom_faqs.filter((_, i) => i !== index),
    }));
  }

  function updateConfig<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  const sections = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "personality", label: "AI Personality", icon: "🧠" },
    { id: "hours", label: "Working Hours", icon: "🕐" },
    { id: "faqs", label: "Custom FAQs", icon: "❓" },
    { id: "followups", label: "Follow-ups", icon: "📤" },
    { id: "escalation", label: "Escalation", icon: "🚨" },
    { id: "features", label: "Features", icon: "🔧" },
    { id: "test", label: "Test Bot", icon: "🧪" },
  ];

  const inputStyle = { width: "100%", padding: "0.7rem 1rem", background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#111827", fontSize: "0.9rem" };
  const labelStyle = { display: "block" as const, color: "#6b7280", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 };

  if (loading) {
    return <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>⏳ Loading settings...</div>;
  }

  return (
    <>
      {/* Save Button Bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        {error && <span style={{ color: "#dc2626", fontSize: "13px" }}>❌ {error}</span>}
        <button onClick={handleSave} disabled={saving} style={{
          padding: "10px 24px", background: saved ? "#16a34a" : "#25D366", border: "none", borderRadius: "10px",
          color: "white", fontWeight: 700, cursor: saving ? "wait" : "pointer", transition: "all 200ms", opacity: saving ? 0.7 : 1,
          fontFamily: "inherit", fontSize: "14px", boxShadow: "0 4px 14px rgba(37,211,102,0.25)",
        }}>
          {saving ? "⏳ Saving..." : saved ? "✅ Saved!" : "💾 Save Changes"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
          {/* Settings Navigation */}
          <div style={{ width: "200px", flexShrink: 0 }}>
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", padding: "0.6rem 1rem",
                border: "none", borderRadius: "8px", marginBottom: "0.25rem", cursor: "pointer", fontSize: "0.85rem",
                background: activeSection === s.id ? "#f0fdf4" : "transparent",
                color: activeSection === s.id ? "#128C7E" : "#6b7280", fontWeight: activeSection === s.id ? 600 : 400,
              }}>
                <span>{s.icon}</span><span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Settings Content */}
          <div style={{ flex: 1, maxWidth: "700px" }}>
            {activeSection === "general" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>⚙️ General Settings</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={labelStyle}>Business Name</label>
                    <input type="text" value={config.business_name} onChange={(e) => updateConfig("business_name", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Type</label>
                    <select value={config.business_type} onChange={(e) => updateConfig("business_type", e.target.value)} style={inputStyle}>
                      {["Restaurant", "Hotel", "Salon", "Clinic", "Retail", "Real Estate", "Gym", "Other"].map((t) => (
                        <option key={t} value={t.toLowerCase().replace(" ", "_")}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Bot Name</label>
                    <input type="text" value={config.bot_name} onChange={(e) => updateConfig("bot_name", e.target.value)} style={inputStyle} placeholder="e.g., Maya, Aria, Assistant" />
                  </div>
                  <div>
                    <label style={labelStyle}>Welcome Message</label>
                    <textarea value={config.welcome_message || ""} onChange={(e) => updateConfig("welcome_message", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
                    <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginTop: "0.25rem" }}>Variables: {"{business_name}"}, {"{customer_name}"}</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Welcome Offer (optional)</label>
                    <input type="text" value={config.welcome_offer || ""} onChange={(e) => updateConfig("welcome_offer", e.target.value)} style={inputStyle} placeholder="e.g., 10% off on first visit!" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Phone</label>
                    <input type="tel" value={config.business_phone || ""} onChange={(e) => updateConfig("business_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Address</label>
                    <input type="text" value={config.business_address || ""} onChange={(e) => updateConfig("business_address", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "personality" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🧠 AI Personality</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                  {PERSONALITY_OPTIONS.map((p) => (
                    <button key={p.value} onClick={() => updateConfig("bot_personality", p.value)} style={{
                      padding: "1.25rem", border: config.bot_personality === p.value ? "2px solid #25D366" : "1px solid #e5e7eb",
                      borderRadius: "12px", background: config.bot_personality === p.value ? "rgba(108, 92, 231, 0.1)" : "#fafbfc",
                      cursor: "pointer", textAlign: "left",
                    }}>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{p.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.25rem", color: "#111827" }}>{p.label}</div>
                      <div style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "hours" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🕐 Working Hours</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                  {Object.entries(config.working_hours || {}).map(([day, hours]) => (
                    <div key={day} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <span style={{ width: "100px", color: "#6b7280", fontSize: "0.85rem", fontWeight: 600, textTransform: "capitalize" }}>{day}</span>
                      <input type="text" value={hours} onChange={(e) => {
                        const newHours = { ...config.working_hours, [day]: e.target.value };
                        updateConfig("working_hours", newHours);
                      }} style={{ ...inputStyle, width: "200px" }} placeholder="09:00-22:00" />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={labelStyle}>Off-Hours Message</label>
                  <textarea value={config.off_hours_message || ""} onChange={(e) => updateConfig("off_hours_message", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
                  <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginTop: "0.25rem" }}>Sent when a customer messages outside working hours.</p>
                </div>
              </div>
            )}

            {activeSection === "faqs" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>❓ Custom FAQs</h2>
                <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: "1.5rem" }}>Add Q&A pairs that your bot will use to answer common questions.</p>
                
                {config.custom_faqs.map((faq, i) => (
                  <div key={i} style={{ padding: "1rem", background: "#fafbfc", borderRadius: "8px", marginBottom: "0.75rem", position: "relative" }}>
                    <button onClick={() => removeFaq(i)} style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "none", border: "none", color: "#E17055", cursor: "pointer", fontSize: "1rem" }}>✕</button>
                    <p style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Q: {faq.question}</p>
                    <p style={{ color: "#6b7280", fontSize: "0.85rem" }}>A: {faq.answer}</p>
                  </div>
                ))}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem", padding: "1rem", border: "1px dashed #e5e7eb", borderRadius: "8px" }}>
                  <input type="text" value={newFaqQ} onChange={(e) => setNewFaqQ(e.target.value)} placeholder="Question (e.g., What's your parking situation?)" style={inputStyle} />
                  <textarea value={newFaqA} onChange={(e) => setNewFaqA(e.target.value)} placeholder="Answer (e.g., Free valet parking for all guests!)" rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
                  <button onClick={addFaq} style={{ alignSelf: "flex-start", padding: "0.5rem 1.25rem", background: "#25D366", border: "none", borderRadius: "6px", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>+ Add FAQ</button>
                </div>
              </div>
            )}

            {activeSection === "followups" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>📤 Follow-up Settings</h2>
                {[
                  { key: "followup_30min" as keyof BotConfig, label: "30-Minute Follow-up", desc: "Confirm booking status" },
                  { key: "followup_3hr" as keyof BotConfig, label: "3-Hour Follow-up", desc: "Gentle reminder for interested leads" },
                  { key: "followup_24hr" as keyof BotConfig, label: "24-Hour Follow-up", desc: "Create urgency with special offers" },
                  { key: "followup_7day" as keyof BotConfig, label: "7-Day Follow-up", desc: "Re-engage cold leads" },
                ].map((item) => (
                  <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid #e5e7eb" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.label}</span>
                      <p style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{item.desc}</p>
                    </div>
                    <button onClick={() => updateConfig(item.key, !config[item.key])} style={{
                      width: "48px", height: "26px", borderRadius: "13px", border: "none", cursor: "pointer",
                      background: config[item.key] ? "#25D366" : "#f3f4f6", position: "relative", transition: "background 0.3s",
                    }}>
                      <span style={{ position: "absolute", width: "20px", height: "20px", borderRadius: "50%", background: "white", top: "3px", left: config[item.key] ? "25px" : "3px", transition: "left 0.3s" }} />
                    </button>
                  </div>
                ))}
                <div style={{ marginTop: "1.5rem" }}>
                  <label style={labelStyle}>Escalation Timeout (minutes)</label>
                  <input type="number" value={config.escalation_timeout_mins} onChange={(e) => updateConfig("escalation_timeout_mins", parseInt(e.target.value) || 30)} min={5} max={120} style={{ ...inputStyle, width: "200px" }} />
                  <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginTop: "0.25rem" }}>Alert staff if bot can&apos;t resolve within this time</p>
                </div>
              </div>
            )}

            {activeSection === "escalation" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🚨 Escalation & Staff</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={labelStyle}>Staff Name</label>
                    <input type="text" value={config.staff_name || ""} onChange={(e) => updateConfig("staff_name", e.target.value)} style={inputStyle} placeholder="e.g., Rajesh" />
                  </div>
                  <div>
                    <label style={labelStyle}>Staff Alert Phone</label>
                    <input type="tel" value={config.staff_phone || ""} onChange={(e) => updateConfig("staff_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                    <p style={{ color: "#9ca3af", fontSize: "0.75rem", marginTop: "0.25rem" }}>Receives WhatsApp alerts for escalations and new bookings.</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Manager Phone (optional)</label>
                    <input type="tel" value={config.manager_phone || ""} onChange={(e) => updateConfig("manager_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "features" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🔧 Advanced</h2>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={labelStyle}>USPs (one per line)</label>
                  <textarea value={(config.usps || []).join("\n")} onChange={(e) => updateConfig("usps", e.target.value.split("\n").filter(Boolean))} rows={4} style={{ ...inputStyle, resize: "vertical" as const }} placeholder="Live music every weekend&#10;Rooftop dining&#10;Award-winning chef" />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={labelStyle}>Hot Lead Keywords (comma-separated)</label>
                  <input type="text" value={(config.hot_keywords || []).join(", ")} onChange={(e) => updateConfig("hot_keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Warm Lead Keywords (comma-separated)</label>
                  <input type="text" value={(config.warm_keywords || []).join(", ")} onChange={(e) => updateConfig("warm_keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} style={inputStyle} />
                </div>
              </div>
            )}

            {activeSection === "test" && (
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🧪 Test Your Bot</h2>
                <div style={{ background: "#fafbfc", borderRadius: "12px", padding: "1.5rem", minHeight: "300px", display: "flex", flexDirection: "column" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    {testMessage && (
                      <div style={{ alignSelf: "flex-end", maxWidth: "70%", padding: "0.75rem 1rem", background: "#25D366", borderRadius: "12px 12px 4px 12px", fontSize: "0.9rem", color: "white" }}>
                        {testMessage}
                      </div>
                    )}
                    {testResponse && (
                      <div style={{ alignSelf: "flex-start", maxWidth: "70%", padding: "0.75rem 1rem", background: "#f3f4f6", borderRadius: "12px 12px 12px 4px", fontSize: "0.9rem" }}>
                        {testResponse}
                      </div>
                    )}
                    {!testMessage && !testResponse && (
                      <p style={{ color: "#9ca3af", textAlign: "center", marginTop: "3rem" }}>Send a test message to preview your bot&apos;s response.</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }} placeholder="Type a test message..." style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={handleTest} style={{ padding: "0.6rem 1.5rem", background: "#25D366", border: "none", borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer" }}>Send</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
