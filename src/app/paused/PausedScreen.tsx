"use client";

import { Bot, Download, Inbox, LogOut, Mail, Megaphone, PackageCheck, PauseCircle, Users } from "lucide-react";

const ON_HOLD = [
  { icon: Bot, label: "Instant AI replies on WhatsApp" },
  { icon: Inbox, label: "Team inbox and live chat" },
  { icon: Megaphone, label: "Broadcasts and follow-ups" },
  { icon: PackageCheck, label: "Order updates and daily reports" },
  { icon: Users, label: "Leads and analytics" },
];

export default function PausedScreen({
  businessName,
  canExport,
  messages,
  customers,
  since,
}: {
  businessName: string;
  canExport: boolean;
  messages: number;
  customers: number;
  since: string | null;
}) {
  const signOut = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login";
  };

  const sinceLabel = since
    ? new Date(since).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })
    : null;
  const subject = encodeURIComponent(`Restore Aries AI for ${businessName}`);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-10">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-sm p-8 space-y-6">
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <PauseCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-balance">
              Aries AI is paused for {businessName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Your subscription payment is overdue. Until it&rsquo;s cleared, customers who message you on WhatsApp get no reply.
            </p>
          </div>
        </div>

        {messages > 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {messages.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages === 1 ? "customer message" : "customer messages"} from {customers.toLocaleString("en-IN")}{" "}
              {customers === 1 ? "person" : "people"} unanswered since the last reply on {sinceLabel}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm text-muted-foreground">
              Every new customer message will go unanswered until your account is restored.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">On hold right now</p>
          <ul className="space-y-2">
            {ON_HOLD.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <a
            href={`mailto:support@ariesai.in?subject=${subject}`}
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Mail className="w-4 h-4" /> Restore my account
          </a>
          <p className="text-xs text-center text-muted-foreground">
            Your conversations, contacts and AI setup are safe. Everything picks up as soon as payment clears, with nothing to set up again.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/60">
          {canExport ? (
            <a
              href="/api/dashboard/settings/export"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-4 h-4" /> Export my data
            </a>
          ) : <span />}
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
