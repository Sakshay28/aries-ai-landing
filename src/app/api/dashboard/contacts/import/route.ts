// ═══════════════════════════════════════════════════════════
// 📥 Contacts Import API — bulk CSV upload
// ═══════════════════════════════════════════════════════════
// Accepts either:
//   • multipart/form-data with field "file" (a .csv file), or
//   • application/json { csv: string }
//
// Parses the CSV, expects header row containing at least `phone`
// (and optionally `name`, `email`, `notes`, `source_detail`).
// De-dupes against existing tenant leads by phone, validates each
// row, and returns a per-row report so the UI can show what
// succeeded / what was skipped.
//
// Hard cap: 5,000 rows per request to prevent abuse and keep
// us under Vercel's serverless time limits.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { isValidPhone, isValidEmail, sanitizeInput } from '@/lib/utils/safety';

const MAX_ROWS = 5_000;

// ── Tiny RFC-4180-ish CSV parser ─────────────────────────
// Supports: quoted fields, embedded commas inside quotes, "" escaped quote,
// CRLF / LF line endings. Good enough for HubSpot/Google Contacts exports.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }

    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  // Last field / row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalisePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

type ImportRow = {
  index: number;
  status: 'imported' | 'skipped_duplicate' | 'skipped_invalid';
  reason?: string;
  phone?: string;
};

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ── 1. Read body (multipart OR json) ────────────────────
    let csvText = '';
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: 'Missing "file" field in form data.' },
          { status: 400 }
        );
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: 'File too large (max 10 MB).' },
          { status: 413 }
        );
      }
      csvText = await file.text();
    } else {
      try {
        const json = await req.json();
        csvText = typeof json.csv === 'string' ? json.csv : '';
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid request body.' },
          { status: 400 }
        );
      }
    }

    if (!csvText.trim()) {
      return NextResponse.json(
        { success: false, error: 'CSV is empty.' },
        { status: 400 }
      );
    }

    // ── 2. Parse CSV ────────────────────────────────────────
    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, error: 'CSV must include a header row and at least one data row.' },
        { status: 400 }
      );
    }
    if (rows.length - 1 > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `Too many rows (max ${MAX_ROWS}).` },
        { status: 413 }
      );
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      phone: header.findIndex((h) => ['phone', 'mobile', 'whatsapp', 'phone_number', 'mobile number'].includes(h)),
      name: header.findIndex((h) => ['name', 'full name', 'full_name', 'contact', 'first name'].includes(h)),
      email: header.findIndex((h) => ['email', 'email address'].includes(h)),
      notes: header.findIndex((h) => ['notes', 'note', 'comment'].includes(h)),
      source: header.findIndex((h) => ['source', 'source_detail', 'origin'].includes(h)),
    };

    if (idx.phone === -1) {
      return NextResponse.json(
        { success: false, error: 'CSV must include a `phone` column.' },
        { status: 400 }
      );
    }

    // ── 3. Validate + dedup ────────────────────────────────
    const dataRows = rows.slice(1);
    const report: ImportRow[] = [];
    const candidateMap = new Map<string, { name: string | null; email: string | null; notes: string | null; source: string | null; index: number }>();

    dataRows.forEach((cells, i) => {
      const rawPhone = cells[idx.phone] ?? '';
      const phone = normalisePhone(rawPhone);

      if (!isValidPhone(phone)) {
        report.push({ index: i + 2, status: 'skipped_invalid', reason: 'Invalid phone', phone });
        return;
      }
      const email = idx.email !== -1 ? (cells[idx.email] ?? '').trim() : '';
      if (email && !isValidEmail(email)) {
        report.push({ index: i + 2, status: 'skipped_invalid', reason: 'Invalid email', phone });
        return;
      }
      if (candidateMap.has(phone)) {
        report.push({ index: i + 2, status: 'skipped_duplicate', reason: 'Duplicate within CSV', phone });
        return;
      }
      candidateMap.set(phone, {
        name: idx.name !== -1 ? sanitizeInput(cells[idx.name] ?? '', 120) || null : null,
        email: email || null,
        notes: idx.notes !== -1 ? sanitizeInput(cells[idx.notes] ?? '', 2000) || null : null,
        source: idx.source !== -1 ? sanitizeInput(cells[idx.source] ?? '', 200) || null : 'csv_import',
        index: i + 2,
      });
    });

    if (candidateMap.size === 0) {
      return NextResponse.json({
        success: true,
        data: { imported: 0, skipped: report.length, report },
      });
    }

    // ── 4. Filter out phones already in DB for this tenant ──
    const phones = Array.from(candidateMap.keys());
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('leads')
      .select('phone')
      .eq('tenant_id', tenantId)
      .in('phone', phones);

    if (existingErr) {
      console.error('Import dedup query failed:', existingErr);
      return NextResponse.json(
        { success: false, error: 'Database error during de-duplication.' },
        { status: 500 }
      );
    }

    const existingSet = new Set((existing ?? []).map((r) => r.phone as string));
    for (const p of existingSet) {
      const c = candidateMap.get(p);
      if (c) {
        report.push({ index: c.index, status: 'skipped_duplicate', reason: 'Already exists', phone: p });
        candidateMap.delete(p);
      }
    }

    // ── 5. Bulk insert remaining ───────────────────────────
    const toInsert = Array.from(candidateMap.entries()).map(([phone, c]) => ({
      tenant_id: tenantId,
      name: c.name,
      phone,
      email: c.email,
      channel: 'manual',
      source_detail: c.source ?? 'csv_import',
      notes: c.notes,
      lead_status: 'new',
      lead_score: 0,
    }));

    let imported = 0;
    if (toInsert.length > 0) {
      // Insert in batches of 500 so we never blow Postgres statement size.
      const BATCH = 500;
      for (let start = 0; start < toInsert.length; start += BATCH) {
        const slice = toInsert.slice(start, start + BATCH);
        const { error: insertErr } = await supabaseAdmin
          .from('leads')
          .insert(slice);
        if (insertErr) {
          console.error('Import batch insert failed:', insertErr);
          return NextResponse.json({
            success: false,
            error: `Insert failed at row ${start + 2}: ${insertErr.message}`,
            data: { imported, skipped: report.length, report },
          }, { status: 500 });
        }
        imported += slice.length;
        slice.forEach((row) => {
          report.push({ index: 0, status: 'imported', phone: row.phone as string });
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        imported,
        skipped: report.filter((r) => r.status !== 'imported').length,
        total: dataRows.length,
        report,
      },
    });
  } catch (err: any) {
    console.error('POST /api/dashboard/contacts/import crash:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
