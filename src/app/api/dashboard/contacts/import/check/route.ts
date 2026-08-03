import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { normalizePhone } from '@/lib/utils/phone';
import { selectInBatches } from '@/lib/supabase/select-in-batches';

const checkSchema = z.object({
  phones: z.array(z.string().trim()),
  defaultCountryCode: z.string().trim().max(5).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const parsed = checkSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: 'Invalid payload.' }, { status: 400 });
    }

    const { phones, defaultCountryCode = '91' } = parsed.data;
    
    // Normalize all input phones
    const normalizedPhones = phones.map(p => normalizePhone(p, defaultCountryCode)).filter(Boolean);
    if (normalizedPhones.length === 0) {
      return NextResponse.json({ success: true, duplicates: [] });
    }

    // Query database for existing matches scoped to this tenant. Chunked: an
    // import can carry thousands of phones and a single .in() of that size 400s
    // in PostgREST — which previously made the whole list look duplicate-free
    // and silently re-imported existing contacts.
    let data: Array<{ id: string; phone: string }>;
    try {
      data = await selectInBatches(normalizedPhones as string[], (batch) =>
        supabaseAdmin.from('leads').select('id, phone').eq('tenant_id', tenantId).in('phone', batch)
      );
    } catch (error) {
      console.error('POST /api/dashboard/contacts/import/check error:', error);
      return NextResponse.json({ success: false, message: 'Database error checking duplicates.' }, { status: 500 });
    }

    const duplicates = (data ?? []).map(r => r.phone);
    const leads = (data ?? []).map(r => ({ phone: r.phone, id: r.id }));

    return NextResponse.json({
      success: true,
      duplicates,
      leads,
    });
  } catch (err: any) {
    console.error('POST /api/dashboard/contacts/import/check crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}
