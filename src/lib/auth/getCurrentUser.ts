import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env, isSupabaseConfigured } from '@/lib/env';
import { isPlanPaused } from '@/lib/tenant/pause';
import { withTransientRetry } from '@/lib/supabase/transient-retry';

export type Role = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface CurrentUser {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_sales_agent: boolean;
  is_platform_admin: boolean;
  tenant_paused: boolean;
}

// Like getTenantId(), but resolves the full team-member row for the signed-in
// user so routes can make role-based decisions. cache() dedupes within one
// server-request lifecycle. Returns null for a paused account (see lib/tenant/pause).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getCurrentUserIncludingPaused();
  return user?.tenant_paused && !user.is_platform_admin ? null : user;
});

// Only for what a paused account must still reach: the /paused data export.
export const getCurrentUserIncludingPaused = cache(async (): Promise<CurrentUser | null> => {
  try {
    const cookieStore = await cookies();
    if (!isSupabaseConfigured) return null;

    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    // Fail closed: do not fall back to local getSession() on network errors.
    // A forged/stolen JWT must not pass when the Supabase verifier is unavailable.
    let userId: string | null = null;
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn('getCurrentUser: getUser() failed, denying access:', userErr.message);
      return null;
    }
    userId = user?.id ?? null;
    if (!userId) return null;

    // select('*') keeps this resilient even if a column (e.g. is_sales_agent)
    // hasn't been migrated yet — missing fields just come back undefined.
    // A transient DB error here used to surface as a bogus 401 on every
    // dashboard API, so it gets one retry (see lib/supabase/transient-retry).
    const { data, error } = await withTransientRetry(() =>
      supabaseAdmin
        .from('users')
        .select('*, tenants!tenant_id(plan_status)')
        .eq('auth_id', userId)
        .single(),
    );

    if (error || !data?.tenant_id) return null;

    const tenantRow = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;

    return {
      id: data.id,
      tenant_id: data.tenant_id,
      email: data.email,
      full_name: data.full_name ?? null,
      role: (data.role ?? 'staff') as Role,
      is_sales_agent: Boolean(data.is_sales_agent),
      is_platform_admin: Boolean(data.is_platform_admin),
      tenant_paused: isPlanPaused(tenantRow?.plan_status),
    };
  } catch (err) {
    console.error('getCurrentUser: unexpected error:', err);
    return null;
  }
});

// Convenience guard for admin-only mutations.
export function canManageTeam(role: Role | undefined | null): boolean {
  return role === 'owner' || role === 'admin';
}
