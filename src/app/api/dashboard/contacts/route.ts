// ═══════════════════════════════════════════════════════════
// 👥 Contacts API — list + create single contact (lead row)
// ═══════════════════════════════════════════════════════════
// GET  /api/dashboard/contacts   → paginated list scoped to tenant
// POST /api/dashboard/contacts   → create one lead manually
//
// Both routes use supabaseAdmin (service role) and enforce
// tenant isolation in code via getTenantId(). The browser must
// NEVER hit `leads` directly — RLS is fixed but we still want
// API-mediated reads so we can paginate, search, and audit.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { isValidPhone, isValidEmail, sanitizeInput } from '@/lib/utils/safety';

// ── Schema for POST body ──────────────────────────────────
const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().nullable(),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(160).optional().nullable(),
  channel: z
    .enum(['whatsapp', 'instagram_dm', 'instagram_comment', 'shopify', 'website', 'manual'])
    .default('manual'),
  source_detail: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

// ── Helper: normalise phone to digits-only (E.164-ish) ────
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits;
}

// ═════════════════════════════════════════════════════════
// GET — list contacts (newest first, paginated, searchable)
// ═════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);
    const search = (searchParams.get('q') ?? '').trim();
    const filter = searchParams.get('filter'); // 'active' | 'high_intent' | 'qualified' | 'escalated'

    let query = supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, channel, lead_status, lead_score, last_message_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      // ILIKE across the searchable columns. We escape % and _ to prevent
      // accidental wildcard injection from user input.
      const safe = search.replace(/[%_]/g, (c) => `\\${c}`);
      query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
    }

    // Filter aliases used by the UI sidebar map onto the actual
    // lead_status enum (new|hot|warm|cold|converted|lost).
    if (filter === 'active') query = query.eq('lead_status', 'warm');
    else if (filter === 'high_intent') query = query.eq('lead_status', 'hot');
    else if (filter === 'qualified') query = query.eq('lead_status', 'converted');
    else if (filter === 'escalated') query = query.eq('lead_status', 'cold');

    const { data, error, count } = await query;
    if (error) {
      console.error('GET /api/dashboard/contacts error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: { limit, offset, total: count ?? 0 },
    });
  } catch (err: any) {
    console.error('GET /api/dashboard/contacts crash:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ═════════════════════════════════════════════════════════
// POST — create one contact
// ═════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = createContactSchema.parse(await req.json());
    } catch (e: any) {
      const issues = e?.issues ?? e?.errors ?? [];
      return NextResponse.json(
        { success: false, error: issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const phone = normalisePhone(body.phone);
    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { success: false, error: 'Phone number must contain 10–15 digits.' },
        { status: 400 }
      );
    }
    if (body.email && !isValidEmail(body.email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address.' },
        { status: 400 }
      );
    }

    // Dedup: if a lead with this phone already exists for this tenant,
    // return it instead of creating a duplicate.
    const { data: existing } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email, channel, lead_status, lead_score, created_at')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        data: existing,
        deduped: true,
      });
    }

    const insertPayload = {
      tenant_id: tenantId,
      name: body.name ? sanitizeInput(body.name, 120) : null,
      phone,
      email: body.email ?? null,
      channel: body.channel,
      source_detail: body.source_detail ? sanitizeInput(body.source_detail, 200) : 'manual_add',
      notes: body.notes ? sanitizeInput(body.notes, 2000) : null,
      lead_status: 'new',
      lead_score: 0,
    };

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(insertPayload)
      .select('id, name, phone, email, channel, lead_status, lead_score, created_at')
      .single();

    if (error) {
      console.error('POST /api/dashboard/contacts error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/dashboard/contacts crash:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
