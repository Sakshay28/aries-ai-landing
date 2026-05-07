"use client";

import Link from "next/link";

export default function PrivacyPolicyPage() {
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
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: "-1px" }}>Privacy Policy</h1>
        <p style={{ color: "#999", fontSize: 14, marginBottom: 48 }}>Last updated: May 7, 2026</p>

        <Section title="1. Introduction">
          Aries AI (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the ariesai.in website and the Aries AI platform (the &quot;Service&quot;). This Privacy Policy informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.
        </Section>

        <Section title="2. Information We Collect">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Account Information:</strong> Name, email address, business name, phone number when you sign up.</li>
            <li><strong>Business Data:</strong> Business type, services, FAQs, and other information you provide to train your AI assistant.</li>
            <li><strong>WhatsApp Messages:</strong> Messages processed through our platform between you and your customers via WhatsApp Business API.</li>
            <li><strong>Usage Data:</strong> Analytics on how you interact with our dashboard, including page views, feature usage, and session duration.</li>
            <li><strong>Payment Information:</strong> Processed securely by our payment partner Razorpay. We do not store credit card numbers.</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>To provide, maintain, and improve our AI-powered WhatsApp automation Service.</li>
            <li>To train your custom AI assistant with your business-specific information.</li>
            <li>To process and deliver WhatsApp messages on your behalf via Meta&apos;s official WhatsApp Business API through our BSP partner (Gupshup).</li>
            <li>To send you transactional emails (billing, account alerts, service notifications).</li>
            <li>To provide customer support and respond to inquiries.</li>
            <li>To detect, prevent, and address fraud and security issues.</li>
          </ul>
        </Section>

        <Section title="4. Data Sharing & Third Parties">
          We share data only with the following categories of service providers, solely for operating the Service:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li><strong>Meta (WhatsApp Business API):</strong> Message delivery and processing.</li>
            <li><strong>Gupshup:</strong> WhatsApp Business Solution Provider (BSP) for API access.</li>
            <li><strong>Google (Gemini AI):</strong> AI language model for generating conversational responses.</li>
            <li><strong>Supabase:</strong> Secure database hosting and authentication.</li>
            <li><strong>Razorpay:</strong> Payment processing.</li>
            <li><strong>Resend:</strong> Transactional email delivery.</li>
          </ul>
          We do <strong>not</strong> sell, rent, or trade your personal information to third parties.
        </Section>

        <Section title="5. Data Security">
          We implement industry-standard security measures including:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>AES-256 encryption for stored credentials and tokens.</li>
            <li>Row-Level Security (RLS) for complete tenant data isolation.</li>
            <li>HTTPS encryption for all data in transit.</li>
            <li>HMAC signature verification for all incoming webhooks.</li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          We retain your data for as long as your account is active. Upon account deletion, we delete your personal data within 30 days, except where retention is required by law. WhatsApp message logs are retained for up to 90 days for service quality and dispute resolution.
        </Section>

        <Section title="7. Your Rights">
          You have the right to:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 12 }}>
            <li>Access, update, or delete your personal information via your dashboard.</li>
            <li>Export your data in a machine-readable format.</li>
            <li>Withdraw consent for data processing at any time.</li>
            <li>Request complete account and data deletion by contacting us.</li>
          </ul>
        </Section>

        <Section title="8. Cookies">
          We use essential cookies for authentication and session management. We do not use advertising or tracking cookies.
        </Section>

        <Section title="9. Children&apos;s Privacy">
          Our Service is not directed to anyone under the age of 18. We do not knowingly collect data from minors.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
        </Section>

        <Section title="11. Contact Us">
          If you have any questions about this Privacy Policy, please contact us at:
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
