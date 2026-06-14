import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const status = req.nextUrl.searchParams.get('status');

  let query = supabaseAdmin
    .from('restaurant_tables')
    .select('*, restaurant_bookings(id, reservation_id, customer_name, customer_phone, party_size, booking_date, booking_status, restaurant_slots(slot_time))')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: tables, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const { data: bookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id, reservation_id, customer_name, customer_phone, party_size, booking_date, booking_status, special_request, table_id, source, restaurant_slots(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', date)
    .in('booking_status', ['confirmed'])
    .order('created_at', { ascending: false });

  const { data: walkIns } = await supabaseAdmin
    .from('restaurant_tables')
    .select('id, name, guest_name, guest_count, seated_at')
    .eq('restaurant_id', tenantId)
    .eq('status', 'occupied')
    .eq('is_active', true)
    .not('seated_at', 'is', null);

  // Enrich tables with guest memory — look up all guest phones on current tables
  const guestPhones = (tables || [])
    .map((t: any) => t.guest_phone)
    .filter((p: string | null) => !!p);
  let guestMemory: Record<string, any> = {};

  if (guestPhones.length > 0) {
    const { data: guests } = await supabaseAdmin
      .from('restaurant_guests')
      .select('customer_phone, customer_name, visit_count, last_visit_date, first_visit_date, preferences, vip_status, tags, notes, birthday, avg_spend')
      .eq('restaurant_id', tenantId)
      .in('customer_phone', guestPhones);

    if (guests) {
      for (const g of guests) {
        guestMemory[g.customer_phone] = g;
      }
    }
  }

  // Also enrich bookings with guest memory
  const bookingPhones = (bookings || [])
    .map((b: any) => b.customer_phone)
    .filter((p: string | null) => !!p && !guestMemory[p]);
  if (bookingPhones.length > 0) {
    const { data: bookingGuests } = await supabaseAdmin
      .from('restaurant_guests')
      .select('customer_phone, customer_name, visit_count, last_visit_date, first_visit_date, preferences, vip_status, tags, notes, birthday, avg_spend')
      .eq('restaurant_id', tenantId)
      .in('customer_phone', bookingPhones);

    if (bookingGuests) {
      for (const g of bookingGuests) {
        guestMemory[g.customer_phone] = g;
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      tables: tables || [],
      bookings: bookings || [],
      walkIns: walkIns || [],
      guestMemory,
    },
  });
}

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json();
  const { action } = body;

  if (action === 'seed') {
    return seedTables(tenantId, body.tables);
  }

  if (action === 'create') {
    const { name, capacity } = body;
    if (!name || !capacity) {
      return NextResponse.json({ success: false, error: 'name and capacity required' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('restaurant_tables')
      .select('id')
      .eq('restaurant_id', tenantId)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: 'Table name already exists' }, { status: 409 });
    }

    const { data: maxOrder } = await supabaseAdmin
      .from('restaurant_tables')
      .select('sort_order')
      .eq('restaurant_id', tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: table, error } = await supabaseAdmin
      .from('restaurant_tables')
      .insert({
        restaurant_id: tenantId,
        name,
        capacity: Number(capacity),
        sort_order: (maxOrder?.sort_order ?? 0) + 1,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: table });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

async function seedTables(tenantId: string, tables?: { name: string; capacity: number }[]) {
  const defaultTables = tables || [
    { name: 'T1', capacity: 2 }, { name: 'T2', capacity: 2 }, { name: 'T3', capacity: 2 },
    { name: 'T4', capacity: 4 }, { name: 'T5', capacity: 4 }, { name: 'T6', capacity: 4 },
    { name: 'T7', capacity: 4 }, { name: 'T8', capacity: 6 }, { name: 'T9', capacity: 6 },
    { name: 'T10', capacity: 6 }, { name: 'T11', capacity: 8 }, { name: 'T12', capacity: 8 },
  ];

  const rows = defaultTables.map((t, i) => ({
    restaurant_id: tenantId,
    name: t.name,
    capacity: t.capacity,
    sort_order: i + 1,
  }));

  const { data, error } = await supabaseAdmin
    .from('restaurant_tables')
    .upsert(rows, { onConflict: 'restaurant_id,name', ignoreDuplicates: true })
    .select();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data, count: data?.length || 0 });
}
