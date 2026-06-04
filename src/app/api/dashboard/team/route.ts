import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser, canManageTeam } from '@/lib/auth/getCurrentUser';

const ASSIGNABLE_ROLES = ['admin', 'manager', 'staff', 'viewer'] as const;

// ── List team members + seat info ──
export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', me.tenant_id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('seat_limit, plan')
    .eq('id', me.tenant_id)
    .single();

  return NextResponse.json({
    success: true,
    users,
    seat_limit: tenant?.seat_limit ?? 5,
    plan: tenant?.plan ?? 'starter',
    me: { id: me.id, role: me.role },
  });
}

// ── Invite a new member ──
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageTeam(me.role)) {
    return NextResponse.json({ success: false, error: 'Only owners and admins can invite members.' }, { status: 403 });
  }

  const { email, role, full_name, is_sales_agent } = await req.json();
  if (!email) return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });

  const safeRole = ASSIGNABLE_ROLES.includes(role) ? role : 'staff';

  // Enforce the tenant's seat limit (set per plan / per deal).
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('seat_limit')
    .eq('id', me.tenant_id)
    .single();
  const seatLimit = tenant?.seat_limit ?? 5;

  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', me.tenant_id);

  if ((count ?? 0) >= seatLimit) {
    return NextResponse.json(
      { success: false, error: `Seat limit reached (${seatLimit} members). Upgrade your plan or contact support to add more seats.` },
      { status: 403 }
    );
  }

  // Send Supabase Auth invite — the user receives an email with a sign-up link.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      tenant_id: me.tenant_id,
      role: safeRole,
      full_name: full_name || null,
    },
  });

  if (authError) {
    return NextResponse.json({ success: false, error: authError.message }, { status: 500 });
  }

  // Upsert user profile row (may already exist if the invite was re-sent).
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: authData.user.id,
        tenant_id: me.tenant_id,
        email,
        role: safeRole,
        full_name: full_name || null,
        is_sales_agent: Boolean(is_sales_agent),
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

// ── Update a member (role and/or sales-team membership) ──
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageTeam(me.role)) {
    return NextResponse.json({ success: false, error: 'Only owners and admins can manage members.' }, { status: 403 });
  }

  const { id, role, is_sales_agent } = await req.json();
  if (!id) return NextResponse.json({ success: false, error: 'Missing member id' }, { status: 400 });

  // Target must belong to this tenant.
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', id)
    .eq('tenant_id', me.tenant_id)
    .single();

  if (!target) return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (typeof is_sales_agent === 'boolean') {
    updates.is_sales_agent = is_sales_agent;
  }

  if (role !== undefined) {
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }
    if (target.role === 'owner') {
      return NextResponse.json({ success: false, error: 'The workspace owner role cannot be changed here.' }, { status: 403 });
    }
    updates.role = role;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', me.tenant_id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: data });
}

// ── Remove a member ──
export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageTeam(me.role)) {
    return NextResponse.json({ success: false, error: 'Only owners and admins can remove members.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('id');
  if (!userId) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

  if (userId === me.id) {
    return NextResponse.json({ success: false, error: 'You cannot remove yourself.' }, { status: 403 });
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .eq('tenant_id', me.tenant_id)
    .single();

  if (!target) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ success: false, error: 'The workspace owner cannot be removed.' }, { status: 403 });
  }

  // Remove from users table (scoped to tenant for safety).
  await supabaseAdmin.from('users').delete().eq('id', userId).eq('tenant_id', me.tenant_id);

  // Also revoke Supabase Auth access (non-blocking).
  supabaseAdmin.auth.admin.deleteUser(userId).catch(e =>
    console.error('Failed to delete auth user:', e)
  );

  return NextResponse.json({ success: true });
}
