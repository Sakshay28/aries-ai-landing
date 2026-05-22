import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const bot_paused = Boolean(body.bot_paused);

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single();
    if (!userData?.tenant_id) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Verify conversation belongs to tenant
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', userData.tenant_id)
      .single();

    if (!conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Update the bot_paused flag
    const updatePayload: any = { bot_paused };
    if (!bot_paused) {
      updatePayload.escalated = false;
      updatePayload.escalated_at = null;
      updatePayload.escalation_reason = null;
    }

    await supabaseAdmin
      .from('conversations')
      .update(updatePayload)
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
