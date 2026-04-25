// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Server-Side (API Routes, Webhooks)
// ═══════════════════════════════════════════════════════════
// Uses the SERVICE ROLE key — bypasses Row-Level Security.
// ONLY use this in server-side code (API routes, webhooks).
// NEVER expose this in client-side code.
//
// Lazy-initialized so the build succeeds without env vars.
// Throws at runtime if env vars are missing when actually used.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;

  const supabaseUrl = process.env.SUPABASE_POOLER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  return _supabaseAdmin;
}

// Proxy that lazily initializes on first property access
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
