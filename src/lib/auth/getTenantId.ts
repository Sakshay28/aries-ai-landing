import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cacheGet, cacheSet } from '@/lib/redis/client';

export async function getTenantId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const cacheKey = `user_tenant:${user.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (userData?.tenant_id) {
      await cacheSet(cacheKey, userData.tenant_id, 3600); // 1 hour TTL
      return userData.tenant_id;
    }
    
    return null;
  } catch {
    return null;
  }
}
