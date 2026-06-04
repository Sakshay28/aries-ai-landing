import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env, isSupabaseConfigured } from '@/lib/env';

export type Role = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface CurrentUser {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_sales_agent: boolean;
  is_platform_admin: boolean;
}

// Like getTenantId(), but resolves the full team-member row for the signed-in
// user so routes can make role-based decisions. cache() dedupes within one
// server-request lifecycle.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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

    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    }
    if (!userId) return null;

    // select('*') keeps this resilient even if a column (e.g. is_sales_agent)
    // hasn't been migrated yet — missing fields just come back undefined.
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', userId)
      .single();

    if (error || !data?.tenant_id) return null;

    return {
      id: data.id,
      tenant_id: data.tenant_id,
      email: data.email,
      full_name: data.full_name ?? null,
      role: (data.role ?? 'staff') as Role,
      is_sales_agent: Boolean(data.is_sales_agent),
      is_platform_admin: Boolean(data.is_platform_admin),
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
