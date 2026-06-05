// ═══════════════════════════════════════════════════════════
// 👥 Contacts CRM API — Scoped tenant operations
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sanitizeInput, isValidEmail } from '@/lib/utils/safety';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone';

// Schema for POST body
// Schema for POST body
const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().nullable(),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().max(160).optional().nullable(),
  channel: z
    .enum(['whatsapp', 'instagram_dm', 'instagram_comment', 'shopify', 'website', 'manual'])
    .default('manual'),
  source_detail: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  defaultCountryCode: z.string().trim().max(5).optional(),
});

// ═════════════════════════════════════════════════════════
// GET — list contacts (scoped, paginated, filtered, searchable)
// ═════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);
    const search = (searchParams.get('q') ?? '').trim();
    const filter = searchParams.get('filter'); // 'all' | 'recent' | 'whatsapp' | 'manual' | 'imported'
    const defaultCountryCode = searchParams.get('cc') ?? '91';

    let query = supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, channel, source_detail, lead_status, lead_score, notes, birthday, last_message_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Apply Filters (Self-healing mapping to resolve leads_channel_check constraint failures)
    if (filter === 'whatsapp') {
      query = query.eq('channel', 'whatsapp');
    } else if (filter === 'manual') {
      query = query.eq('channel', 'manual').or('source_detail.is.null,source_detail.neq.csv_import');
    } else if (filter === 'imported') {
      query = query.eq('channel', 'manual').eq('source_detail', 'csv_import');
    } else if (filter === 'recent') {
      // Sort primarily by last interaction time
      query = query.not('last_message_at', 'is', null);
    }

    // Default Sorting: recent interaction first, then creation date
    if (filter === 'recent') {
      query = query.order('last_message_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Apply Search
    if (search) {
      // If the search string looks like digits, let's normalize it to search standard E.164 representation
      const searchDigits = search.replace(/[^0-9]/g, '');
      const hasNumbers = searchDigits.length >= 3;
      
      const safeSearch = search.replace(/[%_]/g, (c) => `\\${c}`);
      
      if (hasNumbers) {
        const normalizedSearch = normalizePhone(search, defaultCountryCode);
        query = query.or(`name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,phone.ilike.%${normalizedSearch}%,email.ilike.%${safeSearch}%`);
      } else {
        query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
      }
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query and fetch counts in parallel for optimal Performance
    const [queryResult, allCount, recentCount, whatsappCount, manualCount, importedCount] = await Promise.all([
      query,
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('last_message_at', 'is', null),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('channel', 'whatsapp'),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('channel', 'manual').or('source_detail.is.null,source_detail.neq.csv_import'),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('channel', 'manual').eq('source_detail', 'csv_import'),
    ]);

    const { data, error, count } = queryResult;
    if (error) {
      console.error('GET /api/dashboard/contacts error:', error);
      return NextResponse.json({ success: false, message: 'Failed to fetch contacts from database.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      counts: {
        all: allCount.count ?? 0,
        recent: recentCount.count ?? 0,
        whatsapp: whatsappCount.count ?? 0,
        manual: manualCount.count ?? 0,
        imported: importedCount.count ?? 0,
      },
      pagination: { limit, offset, total: count ?? 0 },
    });
  } catch (err: any) {
    console.error('GET /api/dashboard/contacts crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}

// ═════════════════════════════════════════════════════════
// POST — create one contact (Upsert & Merge Duplicates)
// ═════════════════════════════════════════════════════════
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

    const parsed = createContactSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, message: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const defaultCountryCode = body.defaultCountryCode ?? '91';
    const phone = normalizePhone(body.phone, defaultCountryCode);

    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { success: false, message: 'Phone number is invalid. Must contain 7–15 digits.' },
        { status: 400 }
      );
    }

    if (body.email && !isValidEmail(body.email)) {
      return NextResponse.json(
        { success: false, message: 'Email address is invalid.' },
        { status: 400 }
      );
    }

    // Dedup Check: Is this contact phone already in our DB?
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle();

    if (existErr) {
      console.error('POST /api/dashboard/contacts existing query error:', existErr);
      return NextResponse.json({ success: false, message: 'Database error checking duplicates.' }, { status: 500 });
    }

    // If exists, perform an intelligent UPSERT/MERGE
    if (existing) {
      const updatePayload: Record<string, any> = {};

      // Overwrite name if existing has no name or if the existing name is just the phone number
      const existingHasRealName = existing.name && existing.name !== existing.phone;
      if (body.name && !existingHasRealName) {
        updatePayload.name = sanitizeInput(body.name, 120);
      }

      // Fill in email if missing
      if (body.email && !existing.email) {
        updatePayload.email = body.email;
      }

      // Merge notes
      if (body.notes) {
        const sanitizedNote = sanitizeInput(body.notes, 2000);
        updatePayload.notes = existing.notes
          ? `${existing.notes}\n\n[Manual Save]: ${sanitizedNote}`
          : sanitizedNote;
      }

      // If manual add, elevate the channel if it was an auto-created WhatsApp lead
      if (existing.channel === 'whatsapp' && body.channel === 'manual') {
        updatePayload.channel = 'whatsapp'; // Keep whatsapp native channel
      } else if (body.channel && body.channel !== 'manual') {
        updatePayload.channel = body.channel;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('leads')
          .update(updatePayload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (updateErr) {
          console.error('POST /api/dashboard/contacts update error:', updateErr);
          return NextResponse.json({ success: false, message: 'Failed to update and merge existing contact.' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: 'Existing contact successfully merged.',
          data: updated,
          merged: true,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Contact already exists with identical info.',
        data: existing,
        deduped: true,
      });
    }

    // Create fresh contact
    const insertPayload = {
      tenant_id: tenantId,
      name: body.name ? sanitizeInput(body.name, 120) : phone, // Default to phone if no name provided
      phone,
      email: body.email ?? null,
      channel: body.channel,
      source_detail: body.source_detail ? sanitizeInput(body.source_detail, 200) : 'manual_add',
      notes: body.notes ? sanitizeInput(body.notes, 2000) : null,
      lead_status: 'new',
      lead_score: 0,
    };

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('leads')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) {
      console.error('POST /api/dashboard/contacts insert error:', insertErr);
      return NextResponse.json({ success: false, message: 'Failed to create new contact.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contact created successfully.',
      data: created,
    });
  } catch (err: any) {
    console.error('POST /api/dashboard/contacts crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}
