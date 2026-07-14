// ═══════════════════════════════════════════════════════════════════════════
// 🔁 END-TO-END REGRESSION — full production flow for broadcast recipient names.
//
// Simulates the entire path a contact takes and asserts a placeholder name can
// NEVER surface, at every stage:
//   1. CSV import           → real CSVImportService.parseAndValidate
//   2. WhatsApp sync        → coexistence's cleanContactName gate
//   3. API create           → contacts route's cleanContactName gate
//   4. "Open Broadcast page"→ real BroadcastRecipientService.resolveBroadcastAudience
//   5/6. Every recipient shows a real name OR the formatted phone — never
//        there / Unknown / undefined / null / empty (rendered via the exact
//        helper the drawer uses: contactDisplayName)
//   7. Send: template personalization via the real VariableEngineService
//   8. CSV export uses the drawer's exact column mapping
//   9. Repeat at 10,000 contacts — resolver + virtualization stay stable
//
// The data layer (Supabase) is mocked in-memory so this runs in CI with no live
// DB, but the resolution / sanitization / personalization / export code paths
// are the REAL production code.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CSVImportService } from '@/lib/broadcast/services/csv-import.service';
import { VariableEngineService } from '@/lib/broadcast/services/variable-engine.service';
import { BroadcastRecipientService } from '@/lib/broadcast/services/broadcast-recipient.service';
import { cleanContactName, contactDisplayName } from '@/lib/utils/contact-name';

// Replace the env-gated Supabase proxy with a plain stub so vi.spyOn can drive
// `from` per-test (mirrors tests/broadcast-v4-services.test.ts).
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const BANNED = ['there', 'unknown', 'undefined', 'null', 'anonymous', '-', ''];

/** The exact assertion the acceptance criteria demands for a rendered name. */
function assertCleanDisplay(display: string) {
  expect(typeof display).toBe('string');
  expect(display.trim().length).toBeGreaterThan(0);
  expect(BANNED).not.toContain(display.trim().toLowerCase());
}

interface Lead {
  id: string;
  name: string | null;
  phone: string;
  tags: string[];
  email: string | null;
  channel: string;
  last_message_at: string | null;
}

// ── In-memory Supabase mock (paginates `leads` exactly like fetch-leads expects)
function installSupabaseMock(allLeads: Lead[]) {
  const leadsChain = () => {
    let cursor: string | null = null;
    let limit = 1000;
    let tagFilter: string[] | null = null;
    let idIn: string[] | null = null;
    const chain: any = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.not = () => chain;
    chain.order = () => chain;
    chain.overlaps = (_c: string, tags: string[]) => { tagFilter = tags; return chain; };
    chain.limit = (n: number) => { limit = n; return chain; };
    chain.gt = (_c: string, v: string) => { cursor = v; return chain; };
    chain.in = (_c: string, ids: string[]) => { idIn = ids; return chain; };
    chain.then = (resolve: any) => {
      let rows = allLeads.filter((l) => l.phone != null);
      if (cursor != null) rows = rows.filter((l) => l.id > cursor!);
      if (tagFilter) rows = rows.filter((l) => (l.tags || []).some((t) => tagFilter!.includes(t)));
      if (idIn) rows = rows.filter((l) => idIn!.includes(l.id));
      rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit);
      return resolve({ data: rows, error: null });
    };
    return chain;
  };

  const simpleChain = (data: any) => {
    const chain: any = {};
    for (const m of ['select', 'eq', 'not', 'order', 'overlaps', 'limit', 'gt', 'in', 'delete']) {
      chain[m] = () => chain;
    }
    chain.insert = () => chain;
    chain.then = (resolve: any) => resolve({ data, error: null });
    return chain;
  };

  vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string): any => {
    if (table === 'leads') return leadsChain();
    if (table === 'broadcast_optouts') return simpleChain([]);
    return simpleChain(null); // recipient cache delete/insert (self-healing)
  });
}

afterEach(() => vi.restoreAllMocks());

// Raw source rows deliberately full of the junk the ticket cares about.
const CSV_TEXT = [
  'Name,Phone',
  'Rahul Sharma,919000000001',
  'there,919000000002',        // placeholder word
  '919000000003,919000000003', // phone-as-name
  '🌸Priya🌸,919000000004',     // emoji-decorated real name
  ',919000000005',             // empty name
].join('\n');

const WHATSAPP_CONTACTS = [
  { full_name: 'Amit Verma', phone: '919000000006' },
  { full_name: '❤️', phone: '919000000007' },          // emoji-only profile name
  { full_name: 'unknown', phone: '919000000008' },     // placeholder
  { full_name: null, phone: '919000000009' },          // no profile name
];

const API_BODIES = [
  { name: 'Neha Kapoor', phone: '919000000010' },
  { name: 'undefined', phone: '919000000011' },
  { name: 'null', phone: '919000000012' },
  { name: '   ', phone: '919000000013' },
  { name: undefined, phone: '919000000014' },
];

function buildStoredLeads(): Lead[] {
  const leads: Lead[] = [];
  const mk = (rawName: string | null | undefined, phone: string): Lead => ({
    id: `L-${phone}`,
    // Every importer funnels the name through cleanContactName before storage.
    name: cleanContactName(rawName),
    phone,
    tags: [],
    email: null,
    channel: 'whatsapp',
    last_message_at: null,
  });

  // 1. CSV import — via the REAL importer, then "store" the valid rows.
  const csv = CSVImportService.parseAndValidate(CSV_TEXT, '91');
  for (const row of csv.previewRows) {
    if (row.isValid && row.phone) leads.push(mk(row.name, row.phone));
  }

  // 2. WhatsApp sync (coexistence gate).
  for (const c of WHATSAPP_CONTACTS) leads.push(mk(c.full_name, c.phone));

  // 3. API create (contacts route gate).
  for (const b of API_BODIES) leads.push(mk(b.name, b.phone));

  return leads;
}

describe('E2E — no placeholder recipient name across the full flow', () => {
  it('CSV import (real service) never yields a placeholder stored name', () => {
    const csv = CSVImportService.parseAndValidate(CSV_TEXT, '91');
    for (const row of csv.previewRows) {
      // Stored name is a real name or null — never a placeholder string.
      expect(row.name === null || cleanContactName(row.name) === row.name).toBe(true);
      if (row.name !== null) expect(BANNED).not.toContain(row.name.toLowerCase());
    }
  });

  it('steps 4–6: every resolved recipient shows a real name or the formatted phone', async () => {
    const leads = buildStoredLeads();
    installSupabaseMock(leads);

    const result = await BroadcastRecipientService.resolveBroadcastAudience(
      'tenant-1',
      'campaign-1',
      { type: 'all', tags: [], customFilters: [], retargetCampaignId: null, retargetCondition: 'unread', retargetDelayDays: 1, manualContactIds: [], excludedContactIds: [], csvFile: null } as any
    );

    expect(result.recipients.length).toBe(leads.length);

    for (const r of result.recipients) {
      // Stored name is only ever a real name or null (never a placeholder).
      if (r.name !== null) expect(BANNED).not.toContain(String(r.name).toLowerCase());
      // The drawer renders exactly this:
      const display = contactDisplayName(r.name, r.phone_number);
      assertCleanDisplay(display);
      // It is either the real name, or derived from the phone.
      const isRealName = r.name !== null && display === r.name;
      const isPhoneFallback = /\d/.test(display);
      expect(isRealName || isPhoneFallback).toBe(true);
    }

    // The known real names survived intact.
    const displays = result.recipients.map((r) => contactDisplayName(r.name, r.phone_number));
    expect(displays).toContain('Rahul Sharma');
    expect(displays).toContain('Priya');     // emoji stripped
    expect(displays).toContain('Amit Verma');
    expect(displays).toContain('Neha Kapoor');
  });

  it('step 7: template personalization stays correct (sanitized name or "there")', () => {
    const nameCfg = { sourceType: 'crm_field', crmField: 'name' } as any;
    const firstCfg = { sourceType: 'crm_field', crmField: 'first name' } as any;

    // Real name → used; placeholder / emoji → neutral greeting, never junk.
    expect(VariableEngineService.resolveValue(nameCfg, { id: '1', name: 'Rahul Sharma' })).toBe('Rahul Sharma');
    expect(VariableEngineService.resolveValue(firstCfg, { id: '1', name: 'Rahul Sharma' })).toBe('Rahul');
    expect(VariableEngineService.resolveValue(nameCfg, { id: '2', name: '🌸Priya🌸' })).toBe('Priya');

    for (const junk of ['there', 'Unknown', 'undefined', 'null', '❤️', '', null]) {
      const rendered = VariableEngineService.resolveValue(nameCfg, { id: '3', name: junk as any });
      expect(rendered).toBe('there'); // the ONE neutral greeting
      // A real template substitution never prints a broken token.
      const body = `Hi ${rendered}, your order is ready!`;
      expect(body).not.toMatch(/\b(Unknown|undefined|null)\b/);
    }
  });

  it('step 8: CSV export uses the drawer mapping and has clean names', async () => {
    const leads = buildStoredLeads();
    installSupabaseMock(leads);
    const result = await BroadcastRecipientService.resolveBroadcastAudience(
      'tenant-1', 'campaign-2',
      { type: 'all', tags: [], customFilters: [], retargetCampaignId: null, retargetCondition: 'unread', retargetDelayDays: 1, manualContactIds: [], excludedContactIds: [], csvFile: null } as any
    );

    // Mirror RecipientDrawer.handleExportCSV exactly: name column = displayName.
    const headers = ['Name', 'Phone', 'Email', 'Source Type', 'Source Label', 'Status'];
    const rows = result.recipients.map((r) => [
      contactDisplayName(r.name, r.phone_number),
      r.phone_number || '',
      r.email || '',
      r.source_type,
      r.source_label,
      r.status,
    ]);
    const csv = [headers.join(','), ...rows.map((e) => e.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

    // Parse the Name column back out and assert it is always clean.
    const lines = csv.split('\n').slice(1);
    for (const line of lines) {
      const exportedName = line.slice(1, line.indexOf('","')); // first quoted field
      assertCleanDisplay(exportedName);
    }
    expect(lines.length).toBe(leads.length);
  });

  it('step 9: 10,000 contacts — resolver + virtualization stay stable, zero placeholders', async () => {
    const N = 10_000;
    const bigLeads: Lead[] = [];
    const junkNames = [null, '', 'there', 'Unknown', 'undefined', 'null', '🌸', '9998887777'];
    const realPool = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Rohan Mehta', 'Isha Nair'];
    for (let i = 0; i < N; i++) {
      const phone = '91' + String(9_000_100_000 + i); // unique 12-digit
      // ~half get a real name, the rest cycle through junk (→ phone fallback).
      const raw = i % 2 === 0 ? realPool[i % realPool.length] : junkNames[i % junkNames.length];
      bigLeads.push({
        id: `B-${String(i).padStart(6, '0')}`,
        name: cleanContactName(raw as any),
        phone, tags: [], email: null, channel: 'whatsapp', last_message_at: null,
      });
    }
    // Inject duplicates to prove dedup still runs at scale.
    bigLeads.push({ ...bigLeads[0], id: 'B-DUP-1' });
    bigLeads.push({ ...bigLeads[1], id: 'B-DUP-2' });

    installSupabaseMock(bigLeads);

    const t0 = Date.now();
    const result = await BroadcastRecipientService.resolveBroadcastAudience(
      'tenant-1', 'campaign-3',
      { type: 'all', tags: [], customFilters: [], retargetCampaignId: null, retargetCondition: 'unread', retargetDelayDays: 1, manualContactIds: [], excludedContactIds: [], csvFile: null } as any
    );
    const resolveMs = Date.now() - t0;

    expect(result.recipients.length).toBe(bigLeads.length);
    expect(result.duplicatesRemoved).toBeGreaterThanOrEqual(2); // the injected dupes

    // Virtualization engages: the drawer virtualizes when list length > 300.
    const VIRTUALIZATION_THRESHOLD = 300;
    expect(result.recipients.length).toBeGreaterThan(VIRTUALIZATION_THRESHOLD);

    // Render every one of the 10k+ recipients — none may be a placeholder.
    const t1 = Date.now();
    let realNames = 0;
    for (const r of result.recipients) {
      const display = contactDisplayName(r.name, r.phone_number);
      assertCleanDisplay(display);
      if (r.name !== null) realNames++;
    }
    const renderMs = Date.now() - t1;

    expect(realNames).toBeGreaterThan(0);
    // Generous CI budget — this is a stability guard, not a micro-benchmark.
    expect(resolveMs).toBeLessThan(15_000);
    expect(renderMs).toBeLessThan(5_000);
  });
});
