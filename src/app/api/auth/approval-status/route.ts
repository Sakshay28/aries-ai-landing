import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {}
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ approved: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Use admin client to bypass RLS — pending users can't read tenants via anon key.
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!userData?.tenant_id) {
      return NextResponse.json({ approved: false });
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('is_approved')
      .eq('id', userData.tenant_id)
      .single();

    return NextResponse.json({ approved: Boolean(tenant?.is_approved) });
  } catch (err) {
    console.error('[approval-status]', err);
    return NextResponse.json({ approved: false }, { status: 500 });
  }
}
