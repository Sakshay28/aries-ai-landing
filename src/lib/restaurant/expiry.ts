import { supabaseAdmin } from '@/lib/supabase/admin';

// Releases stale pay-to-confirm bookings whose payment never arrived, freeing the
// slot capacity they were holding. Designed to be called lazily (when slot
// availability is read) and from a cron sweep — so it works even on plans that
// only allow daily crons.
//
//   - scoped (restaurantId given): expire one tenant's stale holds using its window.
//   - global (no arg): sweep every tenant using each tenant's own window.
export async function expireStalePendingBookings(restaurantId?: string): Promise<number> {
  try {
    if (restaurantId) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('booking_hold_minutes')
        .eq('id', restaurantId)
        .single();

      const minutes = Number(tenant?.booking_hold_minutes) || 20;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

      const { data, error } = await supabaseAdmin
        .from('restaurant_bookings')
        .update({ booking_status: 'cancelled', payment_status: 'failed' })
        .eq('restaurant_id', restaurantId)
        .eq('booking_status', 'confirmed')
        .eq('payment_status', 'pending')
        .lt('created_at', cutoff)
        .select('id');

      if (error) return 0;
      return data?.length ?? 0;
    }

    // Global sweep — expire across all tenants honouring each one's window.
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id');

    let total = 0;
    for (const t of tenants || []) {
      total += await expireStalePendingBookings(t.id as string);
    }
    return total;
  } catch (e) {
    console.error('expireStalePendingBookings error:', (e as Error).message);
    return 0;
  }
}
