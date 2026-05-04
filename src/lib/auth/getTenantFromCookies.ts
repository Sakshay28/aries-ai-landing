// ───────────────────────────────────────────────────────────────────────────
// Cookie-based tenant resolution for API routes.
// Mirrors the auth pattern used by `getTenantId.ts` and `dashboard/layout.tsx`,
// returning the full tenant row needed by call/billing routes.
// ───────────────────────────────────────────────────────────────────────────
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface TenantContext {
  userId: string;
  tenantId: string;
}

export async function getTenantFromCookies(): Promise<TenantContext | null> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
