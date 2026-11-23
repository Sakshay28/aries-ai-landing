import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { sharedRefreshFetch } from '@/lib/supabase/shared-session-refresh';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env, isSupabaseConfigured } from '@/lib/env';
import { isPlanPaused } from '@/lib/tenant/pause';
import { withTransientRetry } from '@/lib/supabase/transient-retry';

// cache() deduplicates this function within a single server-request lifecycle.
// Every dashboard route that calls getTenantId() in the same render will share
// one auth.getUser() call + one DB query instead of each making their own.
export const getTenantId = cache(async (): Promise<string | null> => {
  try {
    if (!isSupabaseConfigured) return null;

    // Identity comes from the session cookie only. Never read it from a request
    // header: the root middleware.ts does not run (the app lives in src/), so
    // nothing strips client-supplied headers and any such value is forgeable.
    const cookieStore = await cookies();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { fetch: sharedRefreshFetch }, // share session refreshes (lib/supabase/shared-session-refresh)
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {}, // no-op in API routes
      },
    });

    // getUser() validates the JWT server-side against Supabase — use it exclusively.
    // We intentionally do NOT fall back to getSession() on network error: that path
    // does only a local JWT decode without server verification, so a stolen/forged
    // token would pass when the Supabase endpoint is unreachable. Fail closed.
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      // Genuine network failure or invalid token — deny access either way.
      console.warn('getTenantId: getUser() failed, denying access:', userErr.message);
      return null;
    }
    const userId = user?.id ?? null;

    if (!userId) {
      console.log('getTenantId: no authenticated user found in session');
      return null;
    }

    // Use supabaseAdmin to bypass RLS on the users table. Retried once on a DB
    // stall: a 57014 here used to deny a signed-in operator ("Unauthorized").
    const { data: userData, error } = await withTransientRetry(() =>
      supabaseAdmin
        .from('users')
        .select('tenant_id, is_platform_admin, tenants!tenant_id(plan_status)')
        .eq('auth_id', userId)
        .single(),
    );

    if (error) {
      console.error('getTenantId: DB error for auth_id:', userId, error.message);
      return null;
    }

    if (!userData?.tenant_id) {
      console.error('getTenantId: no tenant row for auth_id:', userId);
      return null;
    }

    // Paused accounts are locked out of every tenant API. Same query, so no extra
    // round trip. Platform admins keep access.
    const tenantRaw = (userData as { tenants?: unknown }).tenants as { plan_status?: string } | { plan_status?: string }[] | null | undefined;
    const planStatus = (Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw)?.plan_status;
    if (isPlanPaused(planStatus) && !(userData as { is_platform_admin?: boolean }).is_platform_admin) {
      return null;
    }

    return userData.tenant_id;
  } catch (err) {
    console.error('getTenantId: unexpected error:', err);
    return null;
  }
});
