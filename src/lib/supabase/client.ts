// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Browser-Side (Dashboard UI)
// ═══════════════════════════════════════════════════════════
// Uses the ANON key — respects Row-Level Security.
// Safe to use in client components. Each user only sees
// their own tenant's data thanks to RLS policies.

import { createBrowserClient } from '@supabase/ssr';
import { env, isSupabaseConfigured } from '@/lib/env';

export { isSupabaseConfigured };

export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured) {
    // Return a placeholder that won't crash — pages handle this gracefully
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
