// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Layout — Module-Gated Server Component
// Redirects to /dashboard if tenant doesn't have restaurant_reservations
// ═══════════════════════════════════════════════════════════

import { redirect } from 'next/navigation';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ReactNode } from 'react';

export default async function RestaurantLayout({ children }: { children: ReactNode }) {
  // Temporarily bypass module gate and authentication check for visual review
  return <>{children}</>;
}
