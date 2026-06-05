// ═══════════════════════════════════════════════════════════
// 📥 Contacts Import API — bulk CSV upload
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sanitizeInput, isValidEmail } from '@/lib/utils/safety';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone';

const MAX_ROWS = 5_000;

// CSV Parser supporting quotes, commas, escapes, and CRLF
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
  
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

type ImportRow = {
  index: number;
  status: 'imported' | 'skipped_duplicate' | 'skipped_invalid' | 'merged';
  reason?: string;
  phone?: string;
};

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const defaultCountryCode = searchParams.get('cc') ?? '91';
    const mergeDuplicates = searchParams.get('merge') === 'true';

    // ── 1. Read body (multipart OR json) ────────────────────
    let csvText = '';
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, message: 'Missing "file" field in form data.' },
          { status: 400 }
        );
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, message: 'File too large (maximum size is 10 MB).' },
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
          { success: false, message: 'Invalid request body payload.' },
          { status: 400 }
        );
      }
    }

    if (!csvText.trim()) {
      return NextResponse.json(
        { success: false, message: 'The uploaded CSV file is empty.' },
        { status: 400 }
      );
    }

    // ── 2. Parse CSV ────────────────────────────────────────
    let rows;
    try {
      rows = parseCsv(csvText);
    } catch {
      return NextResponse.json(
        { success: false, message: 'CSV format not recognized. Please check file encoding.' },
        { status: 400 }
      );
    }

    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, message: 'CSV must include a header row and at least one contact row.' },
        { status: 400 }
      );
    }
    if (rows.length - 1 > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `CSV contains too many rows (maximum limit is ${MAX_ROWS} contacts).` },
        { status: 413 }
      );
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      phone: header.findIndex((h) => ['phone', 'mobile', 'whatsapp', 'phone_number', 'mobile number', 'contact_number'].includes(h)),
      name: header.findIndex((h) => ['name', 'full name', 'full_name', 'contact', 'first name', 'first_name', 'last_name'].includes(h)),
      email: header.findIndex((h) => ['email', 'email address', 'email_address'].includes(h)),
      notes: header.findIndex((h) => ['notes', 'note', 'comment', 'description'].includes(h)),
      source: header.findIndex((h) => ['source', 'source_detail', 'origin', 'channel'].includes(h)),
      birthday: header.findIndex((h) => ['birthday', 'birth date', 'birth_date', 'dob', 'date of birth'].includes(h)),
    };

    if (idx.phone === -1) {
      return NextResponse.json(
        { success: false, message: 'CSV header is missing a phone column. Supported: phone, mobile, whatsapp, phone_number.' },
        { status: 400 }
      );
    }

    // ── 3. Validate Rows ────────────────────────────────
    const dataRows = rows.slice(1);
    const report: ImportRow[] = [];
    const candidateMap = new Map<string, { name: string | null; email: string | null; notes: string | null; source: string | null; birthday: string | null; index: number }>();

    // Parse a birthday cell into YYYY-MM-DD. Accepts ISO, DD/MM/YYYY, DD-MM-YYYY.
    const parseBirthday = (raw: string): string | null => {
      const s = (raw || '').trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
      const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (m) {
        let [, d, mo, y] = m;
        if (y.length === 2) y = `20${y}`;
        const dd = d.padStart(2, '0');
        const mm = mo.padStart(2, '0');
        // Sanity: month 1-12, day 1-31
        if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${y}-${mm}-${dd}`;
      }
      return null;
    };

    dataRows.forEach((cells, i) => {
      const rawPhone = cells[idx.phone] ?? '';
      const phone = normalizePhone(rawPhone, defaultCountryCode);

      if (!isValidPhone(phone)) {
        report.push({ index: i + 2, status: 'skipped_invalid', reason: 'Invalid phone format', phone: rawPhone });
        return;
      }
      
      const email = idx.email !== -1 ? (cells[idx.email] ?? '').trim() : '';
      if (email && !isValidEmail(email)) {
        report.push({ index: i + 2, status: 'skipped_invalid', reason: 'Invalid email format', phone });
        return;
      }
      
      if (candidateMap.has(phone)) {
        report.push({ index: i + 2, status: 'skipped_duplicate', reason: 'Duplicate row inside CSV file', phone });
        return;
      }
      
      candidateMap.set(phone, {
        name: idx.name !== -1 ? sanitizeInput(cells[idx.name] ?? '', 120) || null : null,
        email: email || null,
        notes: idx.notes !== -1 ? sanitizeInput(cells[idx.notes] ?? '', 2000) || null : null,
        source: idx.source !== -1 ? sanitizeInput(cells[idx.source] ?? '', 200) || null : 'csv_import',
        birthday: idx.birthday !== -1 ? parseBirthday(cells[idx.birthday] ?? '') : null,
        index: i + 2,
      });
    });

    if (candidateMap.size === 0) {
      return NextResponse.json({
        success: true,
        data: { imported: 0, merged: 0, skipped: report.length, total: dataRows.length, report },
      });
    }

    // ── 4. De-duplicate Against DB Scopes ──
    const candidatePhones = Array.from(candidateMap.keys());
    const { data: existingLeads, error: existingErr } = await supabaseAdmin
      .from('leads')
      .select('id, phone, name, email, notes, channel')
      .eq('tenant_id', tenantId)
      .in('phone', candidatePhones);

    if (existingErr) {
      console.error('Import dedup query error:', existingErr);
      return NextResponse.json({ success: false, message: 'Database error during duplicate resolution.' }, { status: 500 });
    }

    const existingMap = new Map(existingLeads?.map((l) => [l.phone, l]));
    const toInsert: any[] = [];
    let merged = 0;
    let skipped = 0;

    for (const [phone, c] of candidateMap.entries()) {
      const existing = existingMap.get(phone);
      if (existing) {
        if (mergeDuplicates) {
          // Perform an updates merger on matching database contacts
          const updatePayload: Record<string, any> = {};
          const existingHasRealName = existing.name && existing.name !== existing.phone;
          if (c.name && !existingHasRealName) {
            updatePayload.name = c.name;
          }
          if (c.email && !existing.email) {
            updatePayload.email = c.email;
          }
          if (c.notes) {
            updatePayload.notes = existing.notes
              ? `${existing.notes}\n\n[CSV Merge]: ${c.notes}`
              : c.notes;
          }
          if (c.birthday) {
            updatePayload.birthday = c.birthday;
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updateErr } = await supabaseAdmin
              .from('leads')
              .update(updatePayload)
              .eq('id', existing.id);

            if (updateErr) {
              console.error(`Import merge failure for ${phone}:`, updateErr);
              report.push({ index: c.index, status: 'skipped_invalid', reason: 'Failed to merge columns', phone });
              skipped++;
            } else {
              report.push({ index: c.index, status: 'merged', phone });
              merged++;
            }
          } else {
            report.push({ index: c.index, status: 'skipped_duplicate', reason: 'Already exists with identical info', phone });
            skipped++;
          }
        } else {
          // Skip duplicate contacts
          report.push({ index: c.index, status: 'skipped_duplicate', reason: 'Contact already exists', phone });
          skipped++;
        }
      } else {
        toInsert.push({
          tenant_id: tenantId,
          name: c.name ?? phone,
          phone,
          email: c.email,
          channel: 'manual',
          source_detail: 'csv_import',
          notes: c.notes,
          ...(c.birthday && { birthday: c.birthday }),
          lead_status: 'new',
          lead_score: 0,
        });
      }
    }

    // ── 5. Bulk insert remaining contacts ───────────────────────────
    let imported = 0;
    if (toInsert.length > 0) {
      const BATCH = 500;
      for (let start = 0; start < toInsert.length; start += BATCH) {
        const slice = toInsert.slice(start, start + BATCH);
        const { error: insertErr } = await supabaseAdmin
          .from('leads')
          .insert(slice);

        if (insertErr) {
          console.error('Import batch insert error:', insertErr);
          return NextResponse.json({
            success: false,
            message: `Failed to insert batch starting at row ${start + 2}: ${insertErr.message}`,
            data: { imported, merged, skipped: skipped + (toInsert.length - imported), report },
          }, { status: 500 });
        }
        
        imported += slice.length;
        slice.forEach((row) => {
          const c = candidateMap.get(row.phone);
          report.push({ index: c?.index ?? 0, status: 'imported', phone: row.phone });
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Contacts successfully imported.',
      data: {
        imported,
        merged,
        skipped: skipped + report.filter((r) => r.status === 'skipped_invalid').length,
        total: dataRows.length,
        report: report.sort((a, b) => a.index - b.index),
      },
    });
  } catch (err: any) {
    console.error('POST /api/dashboard/contacts/import crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred during CSV import.' }, { status: 500 });
  }
}
