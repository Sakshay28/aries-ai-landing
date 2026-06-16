import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const GUEST_SELECT =
  'customer_phone, customer_name, visit_count, last_visit_date, first_visit_date, preferences, vip_status, tags, notes, birthday, avg_spend';

type Body = Record<string, unknown>;
interface GuestRow { customer_phone: string; [k: string]: unknown }

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const status = req.nextUrl.searchParams.get('status');

  // NOTE: do NOT embed restaurant_bookings here. There are two FKs between
  // restaurant_tables and restaurant_bookings (tables.current_booking_id and
  // bookings.table_id), so PostgREST can't auto-resolve the relationship.
  let query = supabaseAdmin
    .from('restaurant_tables')
    .select('*')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (status) query = query.eq('status', status);

  const { data: tables, error } = await query;
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const [{ data: bookings }, { data: activity }, { data: tenant }] = await Promise.all([
    supabaseAdmin
      .from('restaurant_bookings')
      .select('id, reservation_id, customer_name, customer_phone, party_size, booking_date, booking_status, special_request, table_id, source, restaurant_slots(slot_time)')
      .eq('restaurant_id', tenantId)
      .eq('booking_date', date)
      .in('booking_status', ['confirmed'])
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('restaurant_table_activity')
      .select('id, table_id, table_name, action, actor, guest_name, guest_phone, guest_count, from_status, to_status, detail, created_at')
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabaseAdmin
      .from('tenants')
      .select('tables_open_time, tables_close_time, tables_slot_interval, tables_count')
      .eq('id', tenantId)
      .single(),
  ]);

  // Guest memory — current table guests + booking guests
  const guestMemory: Record<string, GuestRow> = {};
  const phones = new Set<string>();
  for (const t of tables || []) if (t.guest_phone) phones.add(t.guest_phone);
  for (const b of bookings || []) if (b.customer_phone) phones.add(b.customer_phone);

  if (phones.size > 0) {
    const { data: guests } = await supabaseAdmin
      .from('restaurant_guests')
      .select(GUEST_SELECT)
      .eq('restaurant_id', tenantId)
      .in('customer_phone', Array.from(phones));
    for (const g of guests || []) guestMemory[g.customer_phone] = g;
  }

  return NextResponse.json({
    success: true,
    data: {
      tables: tables || [],
      bookings: bookings || [],
      activity: activity || [],
      guestMemory,
      settings: {
        open_time: tenant?.tables_open_time ?? '11:00:00',
        close_time: tenant?.tables_close_time ?? '23:00:00',
        slot_interval: tenant?.tables_slot_interval ?? 30,
        table_count: tenant?.tables_count ?? (tables?.length || 0),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const tenantId = me.tenant_id;

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  switch (action) {
    case 'seed':
    case 'generate':
      return generateTables(tenantId, body);
    case 'create':
      return createTable(tenantId, body);
    case 'update':
      return updateTable(tenantId, body, me.role);
    case 'deactivate':
      return deactivateTable(tenantId, body, me.role);
    case 'settings':
      return updateSettings(tenantId, body, me.role);
    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  }
}

const CAN_MANAGE = ['owner', 'admin', 'manager'];

// ── Bulk-generate T1..Tn from a count + capacity mix ────────────────────────
async function generateTables(tenantId: string, body: Body) {
  // Accepts either an explicit `tables: [{name, capacity}]` list, or
  // `count` (+ optional `mix: [{capacity, count}]`, default capacity fallback).
  let rows: { name: string; capacity: number }[];

  if (Array.isArray(body.tables) && body.tables.length > 0) {
    const list = body.tables as Array<{ name?: unknown; capacity?: unknown }>;
    rows = list
      .filter((t) => !!t?.name && Number(t.capacity) > 0)
      .map((t) => ({ name: String(t.name).slice(0, 10), capacity: Number(t.capacity) }));
  } else {
    const count = Math.max(1, Math.min(500, Math.round(Number(body.count) || 0)));
    if (!count) {
      return NextResponse.json({ success: false, error: 'count or tables required' }, { status: 400 });
    }
    const prefix = typeof body.prefix === 'string' && body.prefix ? body.prefix.slice(0, 4) : 'T';
    const caps = expandCapacities(count, body.mix, Number(body.defaultCapacity) || 4);
    rows = Array.from({ length: count }, (_, i) => ({ name: `${prefix}${i + 1}`, capacity: caps[i] }));
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: 'No valid tables to create' }, { status: 400 });
  }

  // Continue sort_order after any existing tables
  const { data: maxRow } = await supabaseAdmin
    .from('restaurant_tables')
    .select('sort_order')
    .eq('restaurant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = maxRow?.sort_order ?? 0;
  const payload = rows.map((t, i) => ({
    restaurant_id: tenantId,
    name: t.name,
    capacity: t.capacity,
    sort_order: base + i + 1,
  }));

  const { data, error } = await supabaseAdmin
    .from('restaurant_tables')
    .upsert(payload, { onConflict: 'restaurant_id,name', ignoreDuplicates: true })
    .select();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // Record configured count for reference
  await supabaseAdmin
    .from('tenants')
    .update({ tables_count: (base + rows.length) })
    .eq('id', tenantId);

  return NextResponse.json({ success: true, data, count: data?.length || 0 });
}

function expandCapacities(count: number, mix: unknown, fallback: number): number[] {
  const out: number[] = [];
  if (Array.isArray(mix)) {
    for (const m of mix as Array<{ capacity?: unknown; count?: unknown }>) {
      const cap = Number(m?.capacity);
      const n = Math.max(0, Math.round(Number(m?.count) || 0));
      if (cap > 0) for (let i = 0; i < n && out.length < count; i++) out.push(cap);
    }
  }
  while (out.length < count) out.push(fallback > 0 ? fallback : 4);
  return out.slice(0, count);
}

async function createTable(tenantId: string, body: Body) {
  const name = String(body.name ?? '').slice(0, 10);
  const capacity = Number(body.capacity);
  if (!name || !(capacity > 0)) {
    return NextResponse.json({ success: false, error: 'name and capacity required' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('restaurant_tables')
    .select('id, is_active')
    .eq('restaurant_id', tenantId)
    .eq('name', name)
    .maybeSingle();

  // Reactivate a soft-deleted table of the same name instead of erroring
  if (existing) {
    if (existing.is_active) {
      return NextResponse.json({ success: false, error: 'Table name already exists' }, { status: 409 });
    }
    const { data, error } = await supabaseAdmin
      .from('restaurant_tables')
      .update({ is_active: true, capacity: Number(capacity), status: 'available' })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  const { data: maxOrder } = await supabaseAdmin
    .from('restaurant_tables')
    .select('sort_order')
    .eq('restaurant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('restaurant_tables')
    .insert({
      restaurant_id: tenantId,
      name: String(name).slice(0, 10),
      capacity: Number(capacity),
      sort_order: (maxOrder?.sort_order ?? 0) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

async function updateTable(tenantId: string, body: Body, role: string) {
  if (!CAN_MANAGE.includes(role)) {
    return NextResponse.json({ success: false, error: 'Only owners, admins and managers can edit tables.' }, { status: 403 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = String(body.name).slice(0, 10);
  if (body.capacity !== undefined) {
    const cap = Number(body.capacity);
    if (!(cap > 0)) return NextResponse.json({ success: false, error: 'capacity must be > 0' }, { status: 400 });
    updates.capacity = cap;
  }
  if (body.section !== undefined) updates.section = body.section || null;
  if (body.server_name !== undefined) updates.server_name = body.server_name || null;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('restaurant_tables')
    .update(updates)
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .select()
    .single();

  if (error) {
    const conflict = error.code === '23505';
    return NextResponse.json(
      { success: false, error: conflict ? 'Table name already exists' : error.message },
      { status: conflict ? 409 : 500 }
    );
  }
  return NextResponse.json({ success: true, data });
}

async function deactivateTable(tenantId: string, body: Body, role: string) {
  if (!CAN_MANAGE.includes(role)) {
    return NextResponse.json({ success: false, error: 'Only owners, admins and managers can remove tables.' }, { status: 403 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

  const { data: table } = await supabaseAdmin
    .from('restaurant_tables')
    .select('status')
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .maybeSingle();

  if (!table) return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
  if (table.status === 'occupied' || table.status === 'reserved') {
    return NextResponse.json({ success: false, error: 'Free the table before removing it.' }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('restaurant_tables')
    .update({ is_active: false })
    .eq('id', id)
    .eq('restaurant_id', tenantId);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

async function updateSettings(tenantId: string, body: Body, role: string) {
  if (!CAN_MANAGE.includes(role)) {
    return NextResponse.json({ success: false, error: 'Only owners, admins and managers can change settings.' }, { status: 403 });
  }
  const updates: Record<string, unknown> = {};
  if (body.open_time !== undefined) updates.tables_open_time = normalizeHHMM(body.open_time, '11:00');
  if (body.close_time !== undefined) updates.tables_close_time = normalizeHHMM(body.close_time, '23:00');
  if (body.slot_interval !== undefined) {
    const iv = Math.round(Number(body.slot_interval) || 30);
    updates.tables_slot_interval = [15, 30, 60].includes(iv) ? iv : 30;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('tenants').update(updates).eq('id', tenantId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, ...updates });
}

function normalizeHHMM(v: unknown, fallback: string): string {
  const m = String(v).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(m[1])));
  const min = Math.min(59, Math.max(0, parseInt(m[2])));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
