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

    // Try getUser() first (validates token server-side), fallback to getSession()
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // getUser can fail on network issues — fall back to local session decode
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    }

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
