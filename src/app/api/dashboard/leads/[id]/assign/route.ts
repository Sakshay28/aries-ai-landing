// PATCH /api/dashboard/leads/[id]/assign
// Manually reassign a lead to a specific team member

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { assigned_to } = await req.json();

  // Verify the lead belongs to this tenant
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Verify the target user belongs to this tenant (if assigning)
  if (assigned_to) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', assigned_to)
      .eq('tenant_id', tenantId)
      .single();

    if (!user) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({ assigned_to: assigned_to ?? null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
