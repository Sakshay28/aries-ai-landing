"use client";

import { Clock, LogOut, Mail } from 'lucide-react';

export default function PendingPage() {
  const signOut = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl shadow-sm p-8 space-y-5">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <Clock className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your account is under review</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Thanks for signing up! Our team is reviewing your workspace and will activate it shortly.
            You&apos;ll get an email the moment you&apos;re approved.
          </p>
        </div>
        <a href="mailto:support@ariesai.in" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
          <Mail className="w-4 h-4" /> Contact support
        </a>
        <div className="pt-2 border-t border-border/60">
          <button onClick={signOut} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-3">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
