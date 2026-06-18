"use client";

import { useEffect } from 'react';

export default function ImpersonatePage() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const at = params.get('access_token');
    const rt = params.get('refresh_token');

    if (!at || !rt) {
      window.location.href = '/login?error=auth_failed';
      return;
    }

    // Hand tokens to the server route which writes httpOnly cookies
    // and redirects to /dashboard with the client's session active.
    window.location.href = `/api/auth/impersonate-session?at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`;
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Signing in as client…</p>
      </div>
    </div>
  );
}
