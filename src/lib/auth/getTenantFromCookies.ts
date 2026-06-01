// ───────────────────────────────────────────────────────────────────────────
// Cookie-based tenant resolution for API routes.
// Mirrors the auth pattern used by `getTenantId.ts` and `dashboard/layout.tsx`,
// returning the full tenant row needed by call/billing routes.
// ───────────────────────────────────────────────────────────────────────────
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env, isSupabaseConfigured } from '@/lib/env';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

export async function getTenantFromCookies(): Promise<TenantContext | null> {
  try {
    const cookieStore = await cookies();
    if (!isSupabaseConfigured) return null;

    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll() { return cookieStore.getAll(); } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Resolve tenant via the same `users.auth_id` link the dashboard layout uses.
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (!userRow?.tenant_id) return null;
    return { userId: user.id, tenantId: userRow.tenant_id };
  } catch {
    return null;
  }
}
