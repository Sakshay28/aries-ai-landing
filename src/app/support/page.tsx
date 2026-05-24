import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Support — Aries AI',
  description: 'Get help with your Aries AI WhatsApp CRM and automation platform.',
  robots: { index: true, follow: true },
};

import Link from "next/link";

export default function SupportPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ padding: "0 40px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: "-0.5px" }}>Aries <span style={{ color: "#25D366" }}>AI</span></span>
        </Link>
        <Link href="/" style={{ color: "#25D366", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>← Back to Home</Link>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 120px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: "-1px" }}>Customer Support</h1>
        <p style={{ color: "#999", fontSize: 14, marginBottom: 48 }}>We are here to help you automate and grow your business.</p>

        <Section title="1. How to Reach Us">
          Our dedicated team is ready to assist you with setting up your WhatsApp Business API, training your AI, or connecting third-party integrations. Please reach out to the appropriate email below for the fastest response:
          
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: "16px 20px", background: "#f8fafb", borderRadius: 12, border: "1px solid #eee" }}>
              <strong style={{ color: "#111", fontSize: 16 }}>General & Sales Inquiries</strong>
              <p style={{ margin: "4px 0 10px", fontSize: 14, color: "#666" }}>For pricing details, custom enterprise plans, partnerships, or billing questions.</p>
              <a href="mailto:info@ariesai.in" style={{ color: "#25D366", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>info@ariesai.in</a>
            </div>

            <div style={{ padding: "16px 20px", background: "#f8fafb", borderRadius: 12, border: "1px solid #eee" }}>
              <strong style={{ color: "#111", fontSize: 16 }}>Technical & Customer Support</strong>
              <p style={{ margin: "4px 0 10px", fontSize: 14, color: "#666" }}>For onboarding help, API setup, AI chatbot training, webhook configurations, or dashboard bugs.</p>
              <a href="mailto:support@ariesai.in" style={{ color: "#25D366", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>support@ariesai.in</a>
            </div>
          </div>
        </Section>

        <Section title="2. Support Hours & Response Times">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Standard Hours:</strong> Monday to Saturday, 9:00 AM to 7:00 PM IST.</li>
            <li><strong>Response Time:</strong> We review all requests continuously. You can generally expect an email response within <strong>2 hours</strong> during standard operational hours.</li>
            <li><strong>Priority Support:</strong> Active Pro and Enterprise plan subscribers receive priority handling, including dedicated SLA guarantees and access to direct WhatsApp support agents.</li>
          </ul>
        </Section>

        <Section title="3. Self-Serve Resources">
          Before reaching out, we suggest checking the following quick resources available on our platform:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Browse the <strong>Frequently Asked Questions (FAQs)</strong> section on our landing page for answers to general setup and platform compatibility questions.</li>
            <li>Once logged into the Aries AI Dashboard, visit the <strong>Help Center</strong> panel for complete step-by-step video tutorials and connection walkthroughs.</li>
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
