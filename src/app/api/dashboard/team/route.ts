import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, users });
}

export async function POST(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { email, role, full_name } = await req.json();
  if (!email) return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });

  // Enforce 5-seat limit per tenant
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ success: false, error: 'Seat limit reached. Your plan allows up to 5 team members.' }, { status: 403 });
  }

  // Send Supabase Auth invite — the user receives an email with a sign-up link
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      tenant_id: tenantId,
      role: role || 'staff',
      full_name: full_name || null,
    },
  });

  if (authError) {
    return NextResponse.json({ success: false, error: authError.message }, { status: 500 });
  }

  // Upsert user profile row (may already exist if the invite was re-sent)
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: authData.user.id,
        tenant_id: tenantId,
        email,
        role: role || 'staff',
        full_name: full_name || null,
        is_platform_admin: false,
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: data });
}

export async function DELETE(req: Request) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('id');
  if (!userId) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

  // Verify the user belongs to this tenant before deleting
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (!userRow) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  // Remove from users table
  await supabaseAdmin.from('users').delete().eq('id', userId);

  // Also revoke Supabase Auth access (admin only — non-blocking)
  supabaseAdmin.auth.admin.deleteUser(userId).catch(e =>
    console.error('Failed to delete auth user:', e)
  );

  return NextResponse.json({ success: true });
}
