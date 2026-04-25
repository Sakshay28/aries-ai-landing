// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Browser-Side (Dashboard UI)
// ═══════════════════════════════════════════════════════════
// Uses the ANON key — respects Row-Level Security.
// Safe to use in client components. Each user only sees
// their own tenant's data thanks to RLS policies.

import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured) {
    // Return a placeholder that won't crash — pages handle this gracefully
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
