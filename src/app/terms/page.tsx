"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ padding: "0 40px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logo.png" alt="Aries AI" style={{ height: 36 }} />
        </Link>
        <Link href="/" style={{ color: "#25D366", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>← Back to Home</Link>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 120px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: "-1px" }}>Terms of Service</h1>
        <p style={{ color: "#999", fontSize: 14, marginBottom: 48 }}>Last updated: May 7, 2026</p>

        <Section title="1. Acceptance of Terms">
          By accessing or using the Aries AI platform (&quot;Service&quot;) operated by Nexora (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access the Service.
        </Section>

        <Section title="2. Description of Service">
          Aries AI provides an AI-powered WhatsApp Business automation platform that enables businesses to automate customer conversations, capture leads, and manage communications through Meta&apos;s official WhatsApp Business API, facilitated by our BSP partner Gupshup.
        </Section>

        <Section title="3. Account Registration">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>You must provide accurate, complete, and current information when creating an account.</li>
            <li>You are responsible for safeguarding your account credentials.</li>
            <li>You must be at least 18 years old to use the Service.</li>
            <li>One business entity per account. You may not share accounts across multiple businesses.</li>
          </ul>
        </Section>

        <Section title="4. WhatsApp Business API Usage">
          By using our Service, you agree to comply with:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Meta&apos;s WhatsApp Business Policy and Commerce Policy.</li>
            <li>WhatsApp&apos;s acceptable use guidelines — no spam, no unsolicited marketing without opt-in.</li>
            <li>All applicable laws regarding electronic communications in your jurisdiction.</li>
          </ul>
          We reserve the right to suspend accounts that violate WhatsApp&apos;s policies or send spam.
        </Section>

        <Section title="5. Subscription & Billing">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Subscriptions are billed monthly or annually as selected during signup.</li>
            <li>All prices are in Indian Rupees (INR) and exclusive of applicable taxes.</li>
            <li>Per-message template charges apply as per Meta&apos;s conversation-based pricing, passed through at cost.</li>
            <li>Payments are processed securely via Razorpay.</li>
            <li>You may cancel your subscription at any time. No refunds are provided for partial months.</li>
            <li>We offer a 14-day free trial for new accounts. No credit card required to start.</li>
          </ul>
        </Section>

        <Section title="6. Data Ownership">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Your Data:</strong> You retain full ownership of your business data, customer information, and conversation logs.</li>
            <li><strong>AI Training:</strong> We use your provided business information (menu, FAQs, services) solely to train YOUR AI assistant. We do not use your data to train shared models.</li>
            <li><strong>Export:</strong> You may export your data at any time via the dashboard.</li>
          </ul>
        </Section>

        <Section title="7. Prohibited Uses">
          You may not use the Service to:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Send spam, bulk unsolicited messages, or messages without proper opt-in consent.</li>
            <li>Engage in illegal activities or promote illegal products/services.</li>
            <li>Impersonate any person or entity.</li>
            <li>Attempt to gain unauthorized access to our systems.</li>
            <li>Resell or redistribute the Service without written permission.</li>
            <li>Send messages that violate WhatsApp&apos;s content policies (hate speech, violence, adult content).</li>
          </ul>
        </Section>

        <Section title="8. Service Availability">
          We strive for 99.9% uptime but do not guarantee uninterrupted service. The Service depends on third-party infrastructure (Meta WhatsApp API, Gupshup, Supabase) and may experience downtime due to factors beyond our control.
        </Section>

        <Section title="9. Limitation of Liability">
          To the maximum extent permitted by law, Aries AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising out of your use of the Service.
        </Section>

        <Section title="10. Termination">
          We may terminate or suspend your account immediately, without prior notice, if you breach these Terms. Upon termination, your right to use the Service ceases immediately. We will retain your data for 30 days after termination, after which it will be permanently deleted.
        </Section>

        <Section title="11. Modifications">
          We reserve the right to modify these Terms at any time. We will provide notice of material changes via email or dashboard notification. Continued use of the Service after changes constitutes acceptance.
        </Section>

        <Section title="12. Governing Law">
          These Terms shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in [Your City], India.
        </Section>

        <Section title="13. Contact">
          For questions about these Terms, contact us at:
          <div style={{ marginTop: 12, padding: "16px 20px", background: "#f8fafb", borderRadius: 12, border: "1px solid #eee" }}>
            <strong>Aries AI (by Nexora)</strong><br />
            Email: <a href="mailto:sakshayajwani@gmail.com" style={{ color: "#25D366" }}>sakshayajwani@gmail.com</a><br />
            Website: <a href="https://ariesai.in" style={{ color: "#25D366" }}>ariesai.in</a>
          </div>
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
