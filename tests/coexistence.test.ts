// ═══════════════════════════════════════════════════════════
// 🧪 WhatsApp Coexistence handlers
// Run: npx vitest run tests/coexistence.test.ts
// ═══════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/tenant/manager', () => ({ getTenantByPhoneNumberId: vi.fn() }));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByPhoneNumberId } from '@/lib/tenant/manager';
import {
  extractWaMessageContent,
  isCoexistenceChange,
  handleMessageEchoes,
  handleHistorySync,
  handleContactSync,
} from '@/lib/webhook/coexistence';

// ── Minimal stateful supabaseAdmin mock ─────────────────────────────────────
// config is keyed by `${table}:${op}` (op = insert|upsert|update|select) and
// returns the PostgREST-shaped result for that call. Every write is captured.
type Result = { data?: unknown; error?: unknown };
type Handler = Result | ((ctx: { table: string }) => Result);

function makeDb(config: Record<string, Handler>) {
  const captured = {
    inserts: [] as Array<{ table: string; arg: any }>,
    upserts: [] as Array<{ table: string; arg: any; opts: any }>,
    updates: [] as Array<{ table: string; arg: any }>,
  };

  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    const methods = new Set<string>();
    const chain: any = {};
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'neq', 'not', 'gte', 'gt', 'maybeSingle', 'single']) {
      chain[m] = vi.fn(() => { methods.add(m); return chain; });
    }
    chain.insert = vi.fn((arg: any) => { methods.add('insert'); captured.inserts.push({ table, arg }); return chain; });
    chain.upsert = vi.fn((arg: any, opts: any) => { methods.add('upsert'); captured.upserts.push({ table, arg, opts }); return chain; });
    chain.update = vi.fn((arg: any) => { methods.add('update'); captured.updates.push({ table, arg }); return chain; });

    const resolve = (): Result => {
      const op = methods.has('insert') ? 'insert'
               : methods.has('upsert') ? 'upsert'
               : methods.has('update') ? 'update' : 'select';
      const h = config[`${table}:${op}`];
      const r = typeof h === 'function' ? h({ table }) : h;
      return r ?? { data: null, error: null };
    };
    chain.then = (res: (v: Result) => void) => res(resolve());
    return chain;
  });

  return captured;
}

const TENANT = {
  id: 'tenant-1',
  business_name: 'Test Cafe',
  wa_waba_id: 'waba-1',
  wa_phone_number_id: 'pnid-1',
  coexistence_auto_pause: true,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  (getTenantByPhoneNumberId as any).mockResolvedValue(TENANT);
});

// ════════════════════════════════════════════════════════════════════════════
describe('extractWaMessageContent', () => {
  it('reads text bodies', () => {
    expect(extractWaMessageContent({ type: 'text', text: { body: 'hi there' } }))
      .toMatchObject({ content: 'hi there', messageType: 'text' });
  });
  it('uses caption + mime for media', () => {
    const out = extractWaMessageContent({ type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'menu' } });
    expect(out).toMatchObject({ content: 'menu', messageType: 'image', mediaMimeType: 'image/jpeg', mediaCaption: 'menu' });
  });
  it('falls back to a marker for media without caption', () => {
    expect(extractWaMessageContent({ type: 'audio', audio: { id: 'm2', mime_type: 'audio/ogg' } }).content).toBe('[audio]');
  });
  it('flattens interactive replies to their title', () => {
    const out = extractWaMessageContent({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Book a table' } } });
    expect(out).toMatchObject({ content: 'Book a table', messageType: 'text' });
  });
  it('marks unsupported types', () => {
    expect(extractWaMessageContent({ type: 'unsupported' })).toMatchObject({ content: '[unsupported]', messageType: 'unsupported' });
  });
});

describe('isCoexistenceChange', () => {
  it('matches by field name', () => {
    expect(isCoexistenceChange('smb_message_echoes', undefined)).toBe(true);
    expect(isCoexistenceChange('history', undefined)).toBe(true);
    expect(isCoexistenceChange('smb_app_state_sync', undefined)).toBe(true);
  });
  it('matches by value shape when field is absent', () => {
    expect(isCoexistenceChange(undefined, { message_echoes: [] } as any)).toBe(true);
    expect(isCoexistenceChange(undefined, { state_sync: [] } as any)).toBe(true);
  });
  it('does NOT match normal inbound/status changes', () => {
    expect(isCoexistenceChange('messages', { messages: [] } as any)).toBe(false);
    expect(isCoexistenceChange('statuses', { statuses: [] } as any)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('handleMessageEchoes — owner replied from their phone', () => {
  const echoValue = {
    metadata: { phone_number_id: 'pnid-1', display_phone_number: '15550001111' },
    message_echoes: [{ from: '15550001111', to: '919812345678', id: 'wamid.ECHO1', timestamp: '1700000000', type: 'text', text: { body: 'On my way!' } }],
  };

  it('saves an outbound message (sent_via=whatsapp_app) and soft-pauses the bot', async () => {
    const cap = makeDb({
      'messages:select': { data: null },              // dedup — not seen before
      'leads:select': { data: null },
      'conversations:select': { data: [] },
      'leads:upsert': { data: { id: 'lead-1' } },
      'conversations:insert': { data: { id: 'conv-1' } },
      'messages:insert': { data: null, error: null },
      'conversations:update': { data: null, error: null },
    });

    await handleMessageEchoes(echoValue);

    const msg = cap.inserts.find(i => i.table === 'messages')!.arg;
    expect(msg).toMatchObject({
      direction: 'outbound',
      sent_via: 'whatsapp_app',
      ai_generated: false,
      wa_message_id: 'wamid.ECHO1',
      content: 'On my way!',
    });

    const convUpdate = cap.updates.find(u => u.table === 'conversations')!.arg;
    expect(convUpdate.escalated).toBe(true);
    expect(convUpdate.escalation_reason).toBe('human_replied_via_app');
  });

  it('does NOT pause when coexistence_auto_pause is off', async () => {
    (getTenantByPhoneNumberId as any).mockResolvedValue({ ...TENANT, coexistence_auto_pause: false });
    const cap = makeDb({
      'messages:select': { data: null },
      'leads:select': { data: null },
      'conversations:select': { data: [] },
      'leads:upsert': { data: { id: 'lead-1' } },
      'conversations:insert': { data: { id: 'conv-1' } },
      'messages:insert': { data: null, error: null },
      'conversations:update': { data: null, error: null },
    });

    await handleMessageEchoes(echoValue);

    const convUpdate = cap.updates.find(u => u.table === 'conversations')!.arg;
    expect(convUpdate.escalated).toBeUndefined();
    expect(convUpdate.last_message_at).toBeTruthy();
  });

  it('skips entirely when the echo is our own API send (already known wamid)', async () => {
    const cap = makeDb({
      'messages:select': { data: { id: 'existing-msg' } },  // dedup hit
    });

    await handleMessageEchoes(echoValue);

    expect(cap.inserts).toHaveLength(0);   // no duplicate message
    expect(cap.updates).toHaveLength(0);   // no spurious pause
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('handleHistorySync — 6-month backfill', () => {
  const historyValue = {
    metadata: { phone_number_id: 'pnid-1', display_phone_number: '15550001111' },
    history: [{
      metadata: { phase: 'all', chunk_order: 0, progress: '100' },
      threads: [{
        id: '919812345678',
        messages: [
          { from: '919812345678', to: '15550001111', id: 'wamid.H1', timestamp: '1699990000', type: 'text', text: { body: 'do you have a table tonight?' }, history_context: { status: 'read' } },
          { from: '15550001111', to: '919812345678', id: 'wamid.H2', timestamp: '1699990100', type: 'text', text: { body: 'Yes! 8pm works.' }, history_context: { status: 'delivered' } },
        ],
      }],
    }],
  };

  it('imports messages with correct direction, is_historical, and records progress', async () => {
    const cap = makeDb({
      'leads:select': { data: null },
      'conversations:select': { data: [] },
      'leads:upsert': { data: { id: 'lead-1' } },
      'conversations:insert': { data: { id: 'conv-1' } },
      'messages:upsert': { data: null, error: null },
      'conversations:update': { data: null, error: null },
      'coexistence_history_sync:upsert': { data: null, error: null },
    });

    await handleHistorySync(historyValue);

    const batch = cap.upserts.find(u => u.table === 'messages')!.arg as any[];
    expect(batch).toHaveLength(2);
    expect(batch.every(r => r.is_historical === true)).toBe(true);

    const inbound = batch.find(r => r.wa_message_id === 'wamid.H1');
    const outbound = batch.find(r => r.wa_message_id === 'wamid.H2');
    expect(inbound.direction).toBe('inbound');
    expect(outbound.direction).toBe('outbound');
    expect(outbound.sent_via).toBe('whatsapp_app');

    // dedup on wa_message_id so re-delivered chunks never duplicate
    expect(cap.upserts.find(u => u.table === 'messages')!.opts).toMatchObject({ onConflict: 'wa_message_id', ignoreDuplicates: true });

    // progress is recorded and marked completed at 100%
    const sync = cap.upserts.find(u => u.table === 'coexistence_history_sync')!.arg as any;
    expect(sync.progress).toBe('100');
    expect(sync.status).toBe('completed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('handleContactSync — fill blank names only', () => {
  const contactValue = {
    metadata: { phone_number_id: 'pnid-1' },
    state_sync: [{ type: 'contact', action: 'add', contact: { full_name: 'Priya Sharma', phone_number: '919812345678' } }],
  };

  it('fills the name when the lead has none', async () => {
    const cap = makeDb({
      'leads:select': { data: { id: 'lead-1', name: null } },
      'leads:update': { data: null, error: null },
      'conversations:update': { data: null, error: null },
    });

    await handleContactSync(contactValue);

    const leadUpdate = cap.updates.find(u => u.table === 'leads');
    expect(leadUpdate!.arg.name).toBe('Priya Sharma');
    expect(leadUpdate!.arg.wa_contact_synced_at).toBeTruthy();
  });

  it('does NOT clobber a name the CRM already set', async () => {
    const cap = makeDb({
      'leads:select': { data: { id: 'lead-1', name: 'VIP Regular' } },
      'conversations:update': { data: null, error: null },
    });

    await handleContactSync(contactValue);

    expect(cap.updates.find(u => u.table === 'leads')).toBeUndefined();  // no lead name update
  });
});
