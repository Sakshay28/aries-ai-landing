import type { Metadata } from 'next';
import Link from "next/link";

export const metadata: Metadata = {
  title: 'Privacy Rights and Compliance Features | Aries AI',
  description: 'How consent, data export, account deletion, and message retention work in the Aries AI platform.',
  robots: { index: true, follow: true },
};

export default function DataRightsPage() {
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
        .trust-doc p.dek { font-size: 17px; color: var(--ink-soft); max-width: 62ch; margin: 0 0 40px; }
        .trust-doc .summary-card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 4px; margin-bottom: 48px; }
        .trust-doc .table-wrap { overflow-x: auto; }
        .trust-doc table.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .trust-doc table.data-table th, .trust-doc table.data-table td {
          text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--line); vertical-align: top;
        }
        .trust-doc table.data-table tr:last-child td { border-bottom: none; }
        .trust-doc table.data-table th {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
          font-weight: 600; background: var(--accent-soft);
        }
        .trust-doc table.data-table td { color: var(--ink-soft); }
        .trust-doc table.data-table td:first-child { color: var(--ink); font-weight: 500; }
        .trust-doc section.doc-section { display: grid; grid-template-columns: 56px 1fr; gap: 8px 20px; margin-bottom: 44px; }
        .trust-doc .sec-num {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
          font-size: 13px; color: var(--accent); padding-top: 4px;
        }
        .trust-doc .sec-body { min-width: 0; }
        .trust-doc h2.sec-title {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
          font-size: 21px; font-weight: 600; margin: 0 0 14px; color: var(--ink); text-wrap: balance;
        }
        .trust-doc h3.sub-title {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--accent); margin: 20px 0 8px;
        }
        .trust-doc h3.sub-title:first-of-type { margin-top: 0; }
        .trust-doc .sec-body p { max-width: 68ch; color: var(--ink-soft); margin: 0 0 14px; }
        .trust-doc .sec-body ul { margin: 0 0 14px; padding-left: 20px; max-width: 68ch; }
        .trust-doc .sec-body li { color: var(--ink-soft); margin-bottom: 9px; padding-left: 2px; }
        .trust-doc .sec-body li::marker { color: var(--accent); }
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
            <span className="doc-kind">Trust Documentation &middot; Privacy Rights</span>
          </header>

          <h1 className="title">Privacy Rights and Compliance Features</h1>
          <p className="dek">What each data-subject-rights feature in the Aries AI platform does, where it lives in the product, and how it is enforced. Every feature described here is implemented in code and running in production, not a policy statement alone.</p>

          <div className="summary-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Right</th><th>Where to exercise it</th><th>What happens</th></tr></thead>
                <tbody>
                  <tr><td>Give or view consent</td><td>Recorded automatically at signup</td><td>Timestamp, policy version, and signup method stored permanently</td></tr>
                  <tr><td>Export your data</td><td>Settings &rarr; Privacy and Data &rarr; Download My Data</td><td>A complete, human-readable file of your account data downloads immediately</td></tr>
                  <tr><td>Delete your account</td><td>Settings &rarr; Privacy and Data &rarr; Delete My Account</td><td>AI paused and billing cancelled immediately; data erased after 30 days</td></tr>
                  <tr><td>Cancel a deletion request</td><td>Same page, while a deletion is pending</td><td>Account and AI assistant reactivate immediately</td></tr>
                  <tr><td>See who accessed your account</td><td>Settings &rarr; Audit Log</td><td>Every team and support action is listed with time and actor</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <section className="doc-section">
            <span className="sec-num">01</span>
            <div className="sec-body">
              <h2 className="sec-title">Consent Capture</h2>
              <h3 className="sub-title">What it does</h3>
              <p>An account can only be created after the person signing up actively checks a box agreeing to the Terms of Service and Privacy Policy. This replaced a passive footer link that required no action to proceed.</p>
              <h3 className="sub-title">How it is enforced</h3>
              <ul>
                <li>Covers every path by which an account can be created: signup by email verification code, signup through Google, and the legacy password-based signup form.</li>
                <li>Each consent event is permanently recorded with the time it occurred, the policy version agreed to, and the signup method used.</li>
                <li>Enforced on the server, not only in the browser. If a consent record cannot be written for any reason, the account is not created.</li>
                <li>The consent record is retained even if the account is later deleted, so proof of what was agreed to and when survives account closure.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">02</span>
            <div className="sec-body">
              <h2 className="sec-title">Full Account Data Export</h2>
              <h3 className="sub-title">What it does</h3>
              <p>An account owner or administrator can download a complete, readable copy of the data held about their account in a single file, directly from the dashboard, without contacting support.</p>
              <h3 className="sub-title">What&apos;s included</h3>
              <ul>
                <li>Business profile and configuration</li>
                <li>Team member records</li>
                <li>Leads and contacts</li>
                <li>Conversations and messages</li>
                <li>Bookings and reservations</li>
                <li>Knowledge base documents</li>
                <li>Notes attached to conversations</li>
                <li>The account&apos;s consent history</li>
              </ul>
              <h3 className="sub-title">Safeguards</h3>
              <ul>
                <li>Restricted to the owner and administrator roles.</li>
                <li>Limited to three exports per account per day.</li>
                <li>WhatsApp API credentials are never included, even though other configuration fields are.</li>
                <li>Internal identifiers and system-only fields are filtered out before export, so the file reads as an account summary rather than a raw database dump.</li>
                <li>If any single data category fails to return, the export still completes with everything else rather than failing entirely.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">03</span>
            <div className="sec-body">
              <h2 className="sec-title">Account Deletion</h2>
              <h3 className="sub-title">What it does</h3>
              <p>An account owner can permanently delete their entire account and all associated data directly from the dashboard, with no need to contact support.</p>
              <h3 className="sub-title">Safeguards</h3>
              <ul>
                <li>Restricted to the account owner. No other team role, including administrator, can trigger deletion of the whole account.</li>
                <li>Requires typing the exact business name as a confirmation step before the request is accepted.</li>
                <li>The AI assistant is paused and the subscription cancelled immediately once deletion is requested; the account does not keep running or being billed during the grace period.</li>
                <li>A thirty-day grace period follows the request, during which it can be cancelled and the account fully restored.</li>
                <li>After the grace period, an automated daily process permanently deletes all remaining account data.</li>
                <li>A confirmation email is sent at the time of the request, stating the scheduled deletion date and including a direct cancellation link.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">04</span>
            <div className="sec-body">
              <h2 className="sec-title">Automatic Message Retention</h2>
              <h3 className="sub-title">What it does</h3>
              <p>WhatsApp message content older than ninety days is automatically and permanently deleted by an automated process that runs daily, enforcing the retention period stated in the platform&apos;s Privacy Policy.</p>
              <h3 className="sub-title">Scope</h3>
              <ul>
                <li>Applies to the content of WhatsApp messages specifically.</li>
                <li>Lead and contact records are not affected, since they represent an ongoing customer relationship a business needs to maintain. They are only removed through account deletion or a manual action.</li>
                <li>Runs in batches so the process never locks the underlying table for an extended period, regardless of how much historical data exists.</li>
              </ul>
            </div>
          </section>

          <section className="doc-section">
            <span className="sec-num">05</span>
            <div className="sec-body">
              <h2 className="sec-title">Access and Audit Logging</h2>
              <h3 className="sub-title">What it does</h3>
              <p>Any time Aries AI&apos;s internal administrative tools are used to view or modify a specific client&apos;s account, whether that is viewing configuration, editing settings, generating a temporary support login, or approving a new signup, the action is recorded automatically and shown on that client&apos;s own dashboard, under Settings and then Audit Log.</p>
              <h3 className="sub-title">Why it matters</h3>
              <p>Entries generated by platform administrative access are visually labeled as support activity and kept separate from actions taken by the client&apos;s own team, so a client can independently verify what access has occurred rather than relying on a stated policy.</p>
            </div>
          </section>

          <footer className="doc-footer">
            <div className="meta">
              Document last updated: 17 July 2026<br />
              Reviewed and updated as new features ship
            </div>
            <Link className="companion" href="/security">Companion document: Security and Data Protection Documentation &rarr;</Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
