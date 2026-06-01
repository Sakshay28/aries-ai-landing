import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const tag = searchParams.get('tag') || '';
    const optedInOnly = searchParams.get('optedIn') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let dbQuery = supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, tags, last_message_at, converted_at')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    if (query) {
      // Postgres search on name, phone, or email
      dbQuery = dbQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data: contacts, error } = await dbQuery
      .order('name', { ascending: true })
      .limit(limit);

    if (error) throw error;

    // Filter by tags or opt-out in memory if needed
    let filtered = contacts || [];

    if (tag) {
      filtered = filtered.filter(c => (c.tags || []).some((t: string) => t.toLowerCase() === tag.toLowerCase()));
    }

    if (optedInOnly) {
      filtered = filtered.filter(c => {
        const tags = c.tags || [];
        return !tags.some((t: string) => 
          t.toLowerCase() === 'opt-out' || 
          t.toLowerCase() === 'optout' || 
          t.toLowerCase() === 'unsubscribe' || 
          t.toLowerCase() === 'stop'
        );
      });
    }

    return NextResponse.json({ success: true, contacts: filtered });
  } catch (error) {
    console.error('API Contacts Search Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to search contacts' }, { status: 500 });
  }
}
