"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// Landing page for admin impersonation magic links.
// The link arrives as /impersonate#access_token=...&refresh_token=...
// createBrowserClient auto-detects the hash, fires SIGNED_IN, and
// writes the new session into cookies so SSR middleware picks it up.
export default function ImpersonatePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe();
        router.replace('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Signing in as client…</p>
      </div>
    </div>
  );
}
