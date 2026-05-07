"use client";

import Link from "next/link";

export default function DataDeletionPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <nav style={{ padding: "0 40px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 36 }} />
        </Link>
        <Link href="/" style={{ color: "#25D366", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>← Back to Home</Link>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 120px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: "-1px" }}>Data Deletion Instructions</h1>
        <p style={{ color: "#999", fontSize: 14, marginBottom: 48 }}>How to request deletion of your data from Aries AI</p>

        <div style={{ padding: "24px", background: "#f0fdf4", borderRadius: 16, border: "1px solid #bbf7d0", marginBottom: 36 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>Your Data, Your Control</h3>
          <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7 }}>
            At Aries AI, we respect your right to control your personal data. You can request complete deletion of your account and all associated data at any time.
          </p>
        </div>

        <Section title="Option 1: Self-Service (Dashboard)">
          <ol style={{ paddingLeft: 20, lineHeight: 2.2 }}>
            <li>Log in to your Aries AI dashboard at <a href="https://ariesai.in/dashboard" style={{ color: "#25D366" }}>ariesai.in/dashboard</a></li>
            <li>Navigate to <strong>Settings → Account</strong></li>
            <li>Click <strong>&quot;Delete My Account&quot;</strong></li>
            <li>Confirm the deletion in the popup dialog</li>
          </ol>
          This will immediately delete your account and schedule complete data removal within 30 days.
        </Section>

        <Section title="Option 2: Email Request">
          Send an email to <a href="mailto:sakshayajwani@gmail.com" style={{ color: "#25D366" }}>sakshayajwani@gmail.com</a> with:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Subject: <strong>&quot;Data Deletion Request&quot;</strong></li>
            <li>Your registered email address</li>
            <li>Your business name (as registered on Aries AI)</li>
          </ul>
          We will process your request within <strong>5 business days</strong> and send confirmation once complete.
        </Section>

        <Section title="What Gets Deleted">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>✅ Your account and login credentials</li>
            <li>✅ Business profile and AI training data</li>
            <li>✅ All conversation logs and message history</li>
            <li>✅ Lead and contact data</li>
            <li>✅ Analytics and usage data</li>
            <li>✅ WhatsApp API connection tokens</li>
          </ul>
        </Section>

        <Section title="What We May Retain">
          As required by law, we may retain:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Billing records and invoices (for tax/audit compliance — up to 7 years)</li>
            <li>Anonymized, aggregated analytics data that cannot identify you</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#111" }}>{title}</h2>
      <div style={{ fontSize: 15, color: "#555", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}
