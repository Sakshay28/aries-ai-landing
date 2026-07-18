import type { Metadata } from 'next';
import Link from "next/link";

export const metadata: Metadata = {
  title: 'Security and Data Protection | Aries AI',
  description: 'How Aries AI stores client data, isolates it between accounts, controls access, and safeguards the AI assistant.',
  robots: { index: true, follow: true },
};

export default function SecurityDocumentationPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <nav style={{ padding: "0 40px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eee" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: "-0.5px" }}>Aries <span style={{ color: "#25D366" }}>AI</span></span>
        </Link>
        <Link href="/" style={{ color: "#25D366", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>&larr; Back to Home</Link>
      </nav>

      <style>{`
        .trust-doc {
          --ink: #16211D; --ink-soft: #3C4A44; --muted: #5B655F; --paper: #F5F6F4;
          --surface: #FFFFFF; --line: #DDE1DE; --accent: #0F6B54;
          --accent-soft: #E4F1EC;
        }
        @media (prefers-color-scheme: dark) {
          .trust-doc {
            --ink: #E7EBE8; --ink-soft: #C7CEC9; --muted: #93A19A; --paper: #0D1210;
            --surface: #141B18; --line: rgba(255,255,255,0.10); --accent: #3FBE99;
            --accent-soft: rgba(63,190,153,0.12);
          }
        }
        .trust-doc {
          background: var(--paper); color: var(--ink);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased;
        }
        .trust-doc ::selection { background: var(--accent-soft); }
        .trust-doc .page { max-width: 780px; margin: 0 auto; padding: 56px 28px 100px; }
        .trust-doc header.masthead {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--line);
          margin-bottom: 44px; flex-wrap: wrap;
        }
        .trust-doc .brand {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-weight: 600;
        }
        .trust-doc .doc-kind {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
        }
        .trust-doc h1.title {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
          font-size: clamp(28px, 4vw, 38px); line-height: 1.15; letter-spacing: -0.01em;
          margin: 0 0 14px; text-wrap: balance; color: var(--ink);
        }
        .trust-doc p.dek { font-size: 17px; color: var(--ink-soft); max-width: 62ch; margin: 0 0 48px; }
        .trust-doc section.doc-section { display: grid; grid-template-columns: 56px 1fr; gap: 8px 20px; margin-bottom: 40px; }
        .trust-doc .sec-num {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 13px; color: var(--accent); padding-top: 4px;
        }
        .trust-doc .sec-body { min-width: 0; }
        .trust-doc h2.sec-title {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
          font-size: 21px; font-weight: 600; margin: 0 0 12px; color: var(--ink); text-wrap: balance;
        }
        .trust-doc .sec-body p { max-width: 68ch; color: var(--ink-soft); margin: 0 0 14px; }
        .trust-doc .sec-body ul { margin: 0 0 14px; padding-left: 20px; max-width: 68ch; }
        .trust-doc .sec-body li { color: var(--ink-soft); margin-bottom: 9px; padding-left: 2px; }
        .trust-doc .sec-body li::marker { color: var(--accent); }
        .trust-doc .table-wrap { overflow-x: auto; }
        .trust-doc table.data-table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 14px; }
        .trust-doc table.data-table th, .trust-doc table.data-table td {
          text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top;
        }
        .trust-doc table.data-table th {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
          font-weight: 600; background: var(--accent-soft);
        }
        .trust-doc table.data-table td { color: var(--ink-soft); }
        .trust-doc table.data-table td.mono { font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace; font-size: 13px; color: var(--ink); }
        .trust-doc footer.doc-footer {
          margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line);
          display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap;
        }
        .trust-doc footer.doc-footer .meta {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 12.5px; color: var(--muted); line-height: 1.8;
        }
        .trust-doc a.companion { font-size: 13px; color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; }
        .trust-doc a.companion:hover, .trust-doc a.companion:focus-visible { border-bottom-color: var(--accent); }
        .trust-doc a.companion:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
        @media (max-width: 560px) {
          .trust-doc section.doc-section { grid-template-columns: 1fr; }
          .trust-doc .sec-num { padding-top: 0; }
        }
      `}</style>

      <div className="trust-doc">
        <div className="page">
          <header className="masthead">
            <span className="brand">Aries AI</span>
            <span className="doc-kind">Trust Documentation &middot; Security</span>
          </header>

          <h1 className="title">Security and Data Protection Documentation</h1>
          <p className="dek">How the Aries AI platform stores client data, isolates it between accounts, controls who can access it, and what technical safeguards apply to the AI assistant itself. Maintained as a standing reference for security review, procurement, and compliance purposes.</p>

          <section className="doc-section">
            <span className="sec-num">01</span>
            <div className="sec-body">
              <h2 className="sec-title">System Architecture and Hosting</h2>
              <p>Aries AI is a WhatsApp business automation platform. The application runs on Vercel. The primary database runs on Supabase, which itself runs on Amazon Web Services. AI reply generation is performed by Google Cloud&apos;s Vertex AI service. Messages are sent and received through Meta&apos;s WhatsApp Business Platform, the only channel through which a WhatsApp Business API integration can operate.</p>
              <p>No client data is stored on an individual laptop, personal device, or non-production system at any point in the pipeline.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">02</span>
            <div className="sec-body">
              <h2 className="sec-title">Data We Process</h2>
              <p>On behalf of each client, the platform processes the following categories of data:</p>
              <ul>
                <li>Customer contact details provided during a WhatsApp conversation, such as a name, phone number, or email address.</li>
                <li>The content of WhatsApp messages exchanged between the client&apos;s customers and the client&apos;s WhatsApp number.</li>
                <li>Lead, booking, and reservation records generated from those conversations.</li>
                <li>The client&apos;s own business configuration, including knowledge base content, working hours, staff contact details, and WhatsApp credentials.</li>
              </ul>
              <p>The platform does not knowingly collect special category or sensitive personal data such as health records, financial account numbers, or government identification numbers, beyond what a customer may choose to type into a chat message of their own accord.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">03</span>
            <div className="sec-body">
              <h2 className="sec-title">Subprocessors and Data Location</h2>
              <p>The following third parties process data on behalf of Aries AI clients, each limited to what is necessary to provide the service described above.</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Subprocessor</th><th>Purpose</th><th>Data location</th></tr></thead>
                  <tbody>
                    <tr><td>Meta Platforms, Inc.</td><td>Delivery and receipt of WhatsApp messages</td><td className="mono">Meta infrastructure</td></tr>
                    <tr><td>Google Cloud Platform (Vertex AI)</td><td>Generates AI reply content from message text and the client&apos;s knowledge base</td><td className="mono">us-central1, USA</td></tr>
                    <tr><td>Supabase, hosted on AWS</td><td>Primary application database</td><td className="mono">ap-south-1, Mumbai</td></tr>
                    <tr><td>Vercel</td><td>Application hosting and serverless compute</td><td className="mono">Global edge</td></tr>
                    <tr><td>Razorpay Software Pvt. Ltd.</td><td>Subscription billing</td><td className="mono">India</td></tr>
                    <tr><td>Resend</td><td>Transactional email delivery</td><td className="mono">USA</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">04</span>
            <div className="sec-body">
              <h2 className="sec-title">Multi-Tenant Data Isolation</h2>
              <p>Aries AI serves many client businesses from a single, shared application. Every database table that holds client data includes a tenant identifier, and every query is scoped to that identifier by Postgres Row Level Security, a database-level access control mechanism rather than a rule enforced only in application code. In practice, isolation between clients holds even if a specific application route contained a bug, because the database itself refuses to return another client&apos;s rows to a session that isn&apos;t authorized for them.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">05</span>
            <div className="sec-body">
              <h2 className="sec-title">Encryption</h2>
              <ul>
                <li>WhatsApp API credentials, including access tokens and app secrets, are encrypted at rest using AES-256-GCM and are never stored or transmitted in plaintext.</li>
                <li>The encryption key is versioned, so credentials can be re-encrypted under a new key without service interruption if a key ever needs to be rotated.</li>
                <li>All traffic between a client&apos;s browser and the application is encrypted in transit using HTTPS, enforced with an HTTP Strict Transport Security header.</li>
                <li>Underlying storage is encrypted at rest by the cloud infrastructure providers, Amazon Web Services and Google Cloud.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">06</span>
            <div className="sec-body">
              <h2 className="sec-title">Network and Application Security</h2>
              <ul>
                <li>A Content Security Policy header restricts which origins the application may load scripts, styles, and connections from, including limiting WebSocket connections to the platform&apos;s own Supabase project rather than any arbitrary host.</li>
                <li>Incoming webhooks from Meta are verified using HMAC signature checking before their contents are trusted. Unsigned webhook requests are rejected in production when no signing secret is configured, rather than silently accepted.</li>
                <li>File uploads are validated by inspecting the file&apos;s binary header, not merely its declared file type, to block executable files disguised with an innocuous extension.</li>
                <li>Session tokens are set as HTTP-only, secure cookies and are never returned in a JSON response body, preventing them from being read by client-side scripts or leaked into logs.</li>
                <li>Values used in CSV exports are sanitized against formula injection, where a spreadsheet cell beginning with a special character would otherwise execute as a formula when opened.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">07</span>
            <div className="sec-body">
              <h2 className="sec-title">Administrative Access Control</h2>
              <p>Operating a hosted, multi-tenant platform requires some administrative path that is not subject to the same per-client isolation described above. This is true of any hosted software service and is not unique to Aries AI. What matters is how narrowly that access is held and how visible its use is to the client.</p>
              <ul>
                <li>The administrative credential capable of bypassing per-client isolation is held only in server-side environment configuration. It is never sent to a browser and cannot be extracted by inspecting the website.</li>
                <li>Exactly one account is flagged as a platform administrator, gated by a server-side check against a specific, fixed email address, not any value a user can influence.</li>
                <li>Administrative tools used to configure a client&apos;s WhatsApp credentials, approve a new signup, or generate a temporary support login are each independently gated behind that same platform administrator check.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">08</span>
            <div className="sec-body">
              <h2 className="sec-title">Access and Audit Logging</h2>
              <p>Every time platform administrative access is used against a specific client&apos;s account, whether to view or edit that client&apos;s configuration, generate a support login on their behalf, or approve their signup, the action is recorded automatically and shown on that client&apos;s own dashboard, under Settings and then Audit Log. Entries are labeled distinctly as support activity, separate from actions taken by the client&apos;s own team. The log is written by the system at the moment the action occurs, so a client can independently verify what access has taken place rather than relying on a stated policy alone.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">09</span>
            <div className="sec-body">
              <h2 className="sec-title">AI Safety and Content Guardrails</h2>
              <ul>
                <li>Incoming messages are screened for known prompt injection and jailbreak patterns before being passed to the AI model.</li>
                <li>AI responses are screened for accidental leakage of internal system instructions before being sent to a customer.</li>
                <li>The AI is explicitly instructed, in every request, never to invent information about a business it has not been given, and to say so and defer to a human team member rather than guess.</li>
                <li>Permission and policy questions, such as whether something is allowed on a client&apos;s premises, are treated as the highest-risk category: the AI will not answer yes or no unless that exact policy is explicitly stated in the business&apos;s own information, regardless of how confident the underlying model reports itself to be.</li>
                <li>Out-of-scope requests, such as questions about investment advice, illegal activity, or self-harm, are intercepted and redirected before reaching the AI model.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">10</span>
            <div className="sec-body">
              <h2 className="sec-title">Rate Limiting and Abuse Prevention</h2>
              <p>Sensitive and high-volume endpoints are protected by rate limits scoped to the account or IP address making the request, including account signup, verification code requests, full data exports, and bulk contact exports. This prevents a compromised account or automated script from repeatedly pulling an entire client&apos;s data or exhausting shared resources.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">11</span>
            <div className="sec-body">
              <h2 className="sec-title">Data Subject Rights</h2>
              <p>Clients can independently exercise the following rights directly from their own dashboard, without needing to contact support: access and correction of their stored data, export of their full account data, and permanent account deletion. Consent to the platform&apos;s Terms of Service and Privacy Policy is recorded at the point of signup with a timestamp and policy version. These features are documented in full in the companion document, <em>Privacy Rights and Compliance Features</em>, linked below.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">12</span>
            <div className="sec-body">
              <h2 className="sec-title">Incident Response</h2>
              <p>In the event of a confirmed unauthorized access to or disclosure of client data, affected clients are notified without undue delay, describing the nature of the incident, the data affected, and the remedial steps taken. The specific notification timeline and process are set out in the Data Processing Agreement between Aries AI and each client.</p>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">13</span>
            <div className="sec-body">
              <h2 className="sec-title">Compliance Alignment</h2>
              <p>The controls described in this document are designed with reference to the principles of the General Data Protection Regulation and India&apos;s Digital Personal Data Protection Act, 2023, including data minimization, purpose limitation, the right to erasure, and accountability through logging. This document does not constitute a legal certification of compliance with any specific framework.</p>
            </div>
          </section>

          <footer className="doc-footer">
            <div className="meta">
              Document last updated: 17 July 2026<br />
              Reviewed and updated as the platform evolves
            </div>
            <Link className="companion" href="/data-rights">Companion document: Privacy Rights and Compliance Features &rarr;</Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
