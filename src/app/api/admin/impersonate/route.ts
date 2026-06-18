import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const forbidden = () => NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

// POST /api/admin/impersonate
// Body: { email: string }
// Returns a one-time Supabase magic link that logs the caller in as that user.
// Triple-gated: only reachable by is_platform_admin (server-verified JWT).
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) return forbidden();

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://ariesai.in/dashboard' },
  });

  if (error || !data?.properties?.action_link) {
    console.error(`[admin/impersonate] generateLink failed for ${email}:`, error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate login link' },
      { status: 500 }
    );
  }

  console.log(`🔐 [admin/impersonate] ${me.email} → impersonating ${email}`);

  return NextResponse.json({ success: true, url: data.properties.action_link });
}
