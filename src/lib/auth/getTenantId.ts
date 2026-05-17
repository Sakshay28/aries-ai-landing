import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cacheGet, cacheSet } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function getTenantId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    // Get the authenticated user from the session cookie
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('getTenantId: no authenticated user');
      return null;
    }

    const cacheKey = `user_tenant:${user.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    // Use supabaseAdmin to bypass RLS on the users table
    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (error) {
      console.error('getTenantId: users lookup error:', error.message, 'for auth_id:', user.id);
      return null;
    }

    if (userData?.tenant_id) {
      await cacheSet(cacheKey, userData.tenant_id, 3600); // 1 hour TTL
      return userData.tenant_id;
    }

    console.error('getTenantId: no tenant linked for auth_id:', user.id);
    return null;
  } catch (err) {
    console.error('getTenantId: exception:', err);
    return null;
  }
}
