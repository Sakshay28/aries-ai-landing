"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/stats").then(res => res.json()),
      fetch("/api/dashboard/billing").then(res => res.json())
    ]).then(([statsRes, billingRes]) => {
      setTenant({
        plan_type: billingRes.data?.plan || "starter",
        plan_status: billingRes.data?.status || "active",
        message_limit: statsRes.data?.messageLimit || 1000,
        messages_used: statsRes.data?.messagesThisMonth || 0,
        invoices: billingRes.data?.invoices || []
      });
      setLoading(false);
    });
  }, []);

  const usagePct = tenant ? Math.min(100, (tenant.messages_used / tenant.message_limit) * 100) : 0;

  return (
    <>
      {loading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>Loading billing info...</div>
      ) : (
        <>
          {/* Plan Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Current Plan</div>
              <div style={{ fontSize: "28px", fontWeight: 800, textTransform: "capitalize", color: "#111827", letterSpacing: "-0.5px" }}>{tenant?.plan_type}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "100px", fontSize: "12px", fontWeight: 600, background: "#f0fdf4", color: "#16a34a", marginTop: "8px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {tenant?.plan_status}
              </div>
            </div>
            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Monthly Usage</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
                <span style={{ fontSize: "28px", fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>{tenant?.messages_used?.toLocaleString()}</span>
                <span style={{ fontSize: "14px", color: "#9ca3af" }}>/ {tenant?.message_limit?.toLocaleString()}</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "#f3f4f6", borderRadius: "100px", overflow: "hidden" }}>
                <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct > 80 ? "linear-gradient(90deg, #f59e0b, #dc2626)" : "linear-gradient(90deg, #25D366, #128C7E)", borderRadius: "100px", transition: "width 0.5s ease" }} />
              </div>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "6px" }}>{Math.round(usagePct)}% used</div>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", border: "1px solid #bbf7d0", borderRadius: "16px", padding: "28px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>Need more messages or features?</h3>
              <p style={{ fontSize: "14px", color: "#6b7280" }}>Upgrade your plan to unlock unlimited conversations and advanced AI.</p>
            </div>
            <Link href="/#pricing" style={{ padding: "12px 24px", background: "#25D366", color: "white", borderRadius: "10px", fontWeight: 700, fontSize: "14px", textDecoration: "none", whiteSpace: "nowrap", transition: "all 200ms" }}>
              View Plans →
            </Link>
          </div>

          {/* Invoice History */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 700 }}>Invoice History</h2>
            </div>
            {tenant?.invoices && tenant.invoices.length > 0 ? (
              tenant.invoices.map((inv: any) => (
                <div key={inv.id} style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", textTransform: "capitalize" }}>{tenant.plan_type} Plan</div>
                    <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "2px" }}>{new Date(inv.date).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontWeight: 800, fontSize: "15px" }}>₹{inv.amount}</span>
                    <span style={{ padding: "4px 10px", background: "#f0fdf4", color: "#16a34a", borderRadius: "100px", fontSize: "12px", fontWeight: 600, textTransform: "capitalize" }}>{inv.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>
                No invoices found yet.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
