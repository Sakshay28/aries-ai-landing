// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Layout — Module-Gated Server Component
// Redirects to /dashboard if tenant doesn't have restaurant_reservations
// ═══════════════════════════════════════════════════════════

import { redirect } from 'next/navigation';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ReactNode } from 'react';

export default async function RestaurantLayout({ children }: { children: ReactNode }) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    redirect('/login');
  }

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('modules')
    .eq('id', tenantId)
    .single();

  if (error || !tenant || !Array.isArray(tenant.modules) || !tenant.modules.includes('restaurant_reservations')) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
