"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Lead {
  id: string;
  name?: string;
  phone?: string;
  lead_status: string;
  lead_score: number;
  channel?: string;
  last_message_at: string;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/dashboard/leads?limit=100")
      .then(res => res.json())
      .then(data => {
        if (data.success) setLeads(data.data || []);
        setLoading(false);
      });
  }, []);

  const filtered = filter === "all" ? leads : leads.filter(l => l.lead_status === filter);

  const getStatusColor = (status: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      new: { bg: "#ede9fe", color: "#7c3aed" },
      hot: { bg: "#fff7ed", color: "#ea580c" },
      warm: { bg: "#fffbeb", color: "#d97706" },
      cold: { bg: "#f3f4f6", color: "#6b7280" },
      converted: { bg: "#f0fdf4", color: "#16a34a" },
      lost: { bg: "#fef2f2", color: "#dc2626" },
    };
    return m[status] || { bg: "#f3f4f6", color: "#6b7280" };
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#16a34a";
    if (score >= 50) return "#d97706";
    return "#dc2626";
  };

  return (
    <>
      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        {["all", "new", "hot", "warm", "cold", "converted"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 18px",
            border: "1px solid",
            borderColor: filter === f ? "#25D366" : "#e5e7eb",
            borderRadius: "100px",
            background: filter === f ? "#f0fdf4" : "white",
            color: filter === f ? "#128C7E" : "#6b7280",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: filter === f ? 700 : 500,
            textTransform: "capitalize",
            transition: "all 200ms ease",
            fontFamily: "inherit",
          }}>{f === "all" ? `All (${leads.length})` : f}</button>
        ))}
      </div>

      {/* Leads Table */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>Loading leads...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px", opacity: 0.5 }}>📭</div>
            No leads {filter !== "all" ? `with status "${filter}"` : "captured yet"}.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Phone", "Status", "Score", "Channel", "Activity"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "14px 16px", color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.8px", borderBottom: "1px solid #f3f4f6", background: "#fafbfc" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const sc = getStatusColor(lead.lead_status);
                return (
                  <tr key={lead.id} style={{ borderBottom: "1px solid #f3f4f6", transition: "background 200ms" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: "14px" }}>{lead.name || "Unknown"}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: "13px" }}>{lead.phone}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "100px", fontSize: "12px", fontWeight: 600, background: sc.bg, color: sc.color, textTransform: "capitalize" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        {lead.lead_status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 800, fontSize: "14px", color: getScoreColor(lead.lead_score) }}>{lead.lead_score}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: "13px", textTransform: "capitalize" }}>{lead.channel}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af", fontSize: "13px" }}>
                      {new Date(lead.last_message_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
