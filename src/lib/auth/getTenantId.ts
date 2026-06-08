import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env, isSupabaseConfigured } from '@/lib/env';

// cache() deduplicates this function within a single server-request lifecycle.
// Every dashboard route that calls getTenantId() in the same render will share
// one auth.getUser() call + one DB query instead of each making their own.
export const getTenantId = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    if (!isSupabaseConfigured) return null;

    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {}, // no-op in API routes
      },
    });

    // getUser() validates the JWT server-side against Supabase — use it exclusively.
    // We intentionally do NOT fall back to getSession() on network error: that path
    // does only a local JWT decode without server verification, so a stolen/forged
    // token would pass when the Supabase endpoint is unreachable. Fail closed.
    let userId: string | null = null;
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      // Genuine network failure or invalid token — deny access either way.
      console.warn('getTenantId: getUser() failed, denying access:', userErr.message);
      return null;
    }
    userId = user?.id ?? null;

    if (!userId) {
      console.log('getTenantId: no authenticated user found in session');
      return null;
    }

    // Use supabaseAdmin to bypass RLS on the users table
    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', userId)
      .single();

    if (error) {
      console.error('getTenantId: DB error for auth_id:', userId, error.message);
      return null;
    }

    if (!userData?.tenant_id) {
      console.error('getTenantId: no tenant row for auth_id:', userId);
      return null;
    }

    return userData.tenant_id;
  } catch (err) {
    console.error('getTenantId: unexpected error:', err);
    return null;
  }
});
