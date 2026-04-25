"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
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
    const res = await fetch("/api/dashboard/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate)
    });
    const data = await res.json();
    if (data.success) {
      setTemplates([...templates, data.data]);
      setShowModal(false);
      setNewTemplate({ name: "", category: "MARKETING", language: "en_US", text: "" });
    }
  };

  const loadPrebuilt = (t: any) => {
    setNewTemplate({ name: t.name, category: t.category, language: "en_US", text: t.text });
    setShowModal(true);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads" },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "📝", label: "Templates", href: "/dashboard/templates", active: true },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing" },
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

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📝 Template Manager</h1>
          <button onClick={() => setShowModal(true)} style={{ padding: "0.6rem 1.2rem", background: "var(--primary)", color: "white", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
            + Create Template
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "2rem" }}>
          
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>My WhatsApp Templates</h2>
            {loading ? <p>Loading templates from Meta...</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Template Name", "Category", "Status", "Reason"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "1rem 0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{t.name}</td>
                      <td style={{ padding: "1rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{t.category}</td>
                      <td style={{ padding: "1rem 0.75rem" }}>
                        <span style={{ 
                          padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, 
                          background: t.status === 'APPROVED' ? 'rgba(0,184,148,0.1)' : t.status === 'REJECTED' ? 'rgba(225,112,85,0.1)' : 'rgba(253,203,110,0.1)',
                          color: t.status === 'APPROVED' ? '#00B894' : t.status === 'REJECTED' ? '#E17055' : '#FDCB6E'
                        }}>{t.status}</span>
                      </td>
                      <td style={{ padding: "1rem 0.75rem", color: "#E17055", fontSize: "0.8rem", maxWidth: "200px" }}>{t.rejection_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass-card" style={{ padding: "1.5rem", height: "fit-content" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Pre-built Library</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>Click any template to customize and submit it for Meta approval instantly.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {PREBUILT_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => loadPrebuilt(t)} style={{ textAlign: "left", padding: "0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", transition: "border 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--primary)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--text-primary)" }}>{t.name.replace(/_/g, ' ')}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.text}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
            <div className="glass-card" style={{ width: "500px", padding: "2rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>Submit New Template</h2>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Template Name (lowercase, underscores)</label>
                  <input required className="input" value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value.toLowerCase().replace(/[^a-z_]/g, '')})} placeholder="e.g. spring_sale_offer" style={{ width: "100%", padding: "0.75rem" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Category</label>
                  <select className="input" value={newTemplate.category} onChange={e => setNewTemplate({...newTemplate, category: e.target.value})} style={{ width: "100%", padding: "0.75rem" }}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Message Text (use {'{{1}}'}, {'{{2}}'} for variables)</label>
                  <textarea required className="input" value={newTemplate.text} onChange={e => setNewTemplate({...newTemplate, text: e.target.value})} rows={4} style={{ width: "100%", padding: "0.75rem", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "0.75rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" style={{ flex: 1, padding: "0.75rem", background: "var(--primary)", border: "none", borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer" }}>Submit to Meta</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
