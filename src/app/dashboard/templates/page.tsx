"use client";

import { useState, useEffect } from "react";

const PREBUILT_TEMPLATES = [
  { name: "restaurant_reservation_confirm", category: "UTILITY", text: "Hi {{1}}, your table for {{2}} at {{3}} is confirmed. We look forward to hosting you! 🍽️" },
  { name: "restaurant_weekend_offer", category: "MARKETING", text: "Hey {{1}}! 🎉 Join us this weekend at {{2}} for a special offer: {{3}}. Reply 'BOOK' to reserve a table." },
  { name: "gym_membership_renewal", category: "UTILITY", text: "Hi {{1}}, your gym membership at {{2}} expires in {{3}} days. Renew now to keep your streak alive! 💪" },
  { name: "gym_personal_training_promo", category: "MARKETING", text: "Hey {{1}}, ready to crush your goals? Get 20% off your first 5 Personal Training sessions at {{2}}. Reply 'YES' to claim." },
  { name: "jeweler_appointment_reminder", category: "UTILITY", text: "Hi {{1}}, this is a reminder for your viewing appointment at {{2}} on {{3}}. See you soon! ✨" },
  { name: "jeweler_new_collection", category: "MARKETING", text: "Hello {{1}}! 💍 Our new bridal collection has just arrived at {{2}}. Book a private viewing and receive a complimentary gift." },
  { name: "general_abandoned_cart", category: "MARKETING", text: "Hi {{1}}, you left something behind! 🛒 Complete your purchase at {{2}} and use code {{3}} for 10% off." },
  { name: "general_event_invite", category: "MARKETING", text: "You're invited, {{1}}! 🎈 Join us for {{2}} on {{3}}. Reply to RSVP." },
  { name: "general_feedback_request", category: "MARKETING", text: "Hi {{1}}, thanks for visiting {{2}}! How was your experience? Rate us from 1 (Poor) to 5 (Excellent). ⭐" },
  { name: "general_follow_up", category: "MARKETING", text: "Hey {{1}} 👋 We noticed you were interested in {{2}}. Can we help answer any questions?" },
];

interface PrebuiltTemplate { name: string; category: string; text: string; }
interface WaTemplate { id: string; name: string; category: string; status: string; rejection_reason?: string; }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", category: "MARKETING", language: "en_US", text: "" });

  useEffect(() => {
    fetch("/api/dashboard/templates")
      .then(res => res.json())
      .then(data => {
        if (data.success) setTemplates(data.data);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/dashboard/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTemplate) });
    const data = await res.json();
    if (data.success) {
      setTemplates([...templates, data.data]);
      setShowModal(false);
      setNewTemplate({ name: "", category: "MARKETING", language: "en_US", text: "" });
    }
  };

  const loadPrebuilt = (t: PrebuiltTemplate) => {
    setNewTemplate({ name: t.name, category: t.category, language: "en_US", text: t.text });
    setShowModal(true);
  };

  const inputStyle = { width: "100%", padding: "12px 14px", background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", color: "#111827", fontFamily: "inherit" as const, outline: "none" };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <button onClick={() => setShowModal(true)} style={{ padding: "10px 20px", background: "#25D366", color: "white", border: "none", borderRadius: "10px", fontWeight: 700, cursor: "pointer", fontSize: "14px", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(37,211,102,0.25)", transition: "all 200ms" }}>
          + Create Template
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "20px" }}>
        {/* My Templates */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700 }}>My WhatsApp Templates</h2>
          </div>
          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>Loading templates from Meta...</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Template Name", "Category", "Status", "Reason"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "14px 16px", color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.8px", borderBottom: "1px solid #f3f4f6", background: "#fafbfc" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: "14px" }}>{t.name}</td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", fontSize: "13px" }}>{t.category}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: "100px", fontSize: "12px", fontWeight: 600,
                        background: t.status === 'APPROVED' ? '#f0fdf4' : t.status === 'REJECTED' ? '#fef2f2' : '#fffbeb',
                        color: t.status === 'APPROVED' ? '#16a34a' : t.status === 'REJECTED' ? '#dc2626' : '#d97706'
                      }}>{t.status}</span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#dc2626", fontSize: "13px", maxWidth: "200px" }}>{t.rejection_reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pre-built Library */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "20px", height: "fit-content" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "8px" }}>Pre-built Library</h2>
          <p style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "16px" }}>Click to customize and submit for Meta approval.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {PREBUILT_TEMPLATES.map((t, i) => (
              <button key={i} onClick={() => loadPrebuilt(t)} style={{
                textAlign: "left", padding: "12px", background: "#fafbfc", border: "1px solid #e5e7eb",
                borderRadius: "10px", cursor: "pointer", transition: "all 200ms", fontFamily: "inherit",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#25D366"; e.currentTarget.style.background = "#f0fdf4"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fafbfc"; }}>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "4px", color: "#111827" }}>{t.name.replace(/_/g, ' ')}</div>
                <div style={{ color: "#9ca3af", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.text}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
          <div style={{ width: "500px", background: "white", borderRadius: "20px", padding: "32px", boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "24px" }}>Submit New Template</h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "13px", color: "#374151", fontWeight: 600, marginBottom: "6px", display: "block" }}>Template Name (lowercase, underscores)</label>
                <input required value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value.toLowerCase().replace(/[^a-z_]/g, '')})} placeholder="e.g. spring_sale_offer" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "13px", color: "#374151", fontWeight: 600, marginBottom: "6px", display: "block" }}>Category</label>
                <select value={newTemplate.category} onChange={e => setNewTemplate({...newTemplate, category: e.target.value})} style={inputStyle}>
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "13px", color: "#374151", fontWeight: 600, marginBottom: "6px", display: "block" }}>Message Text (use {'{{1}}'}, {'{{2}}'} for variables)</label>
                <textarea required value={newTemplate.text} onChange={e => setNewTemplate({...newTemplate, text: e.target.value})} rows={4} style={{ ...inputStyle, resize: "vertical" as const }} />
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "12px", background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", color: "#6b7280", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: "14px" }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: "12px", background: "#25D366", border: "none", borderRadius: "10px", color: "white", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "14px" }}>Submit to Meta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
