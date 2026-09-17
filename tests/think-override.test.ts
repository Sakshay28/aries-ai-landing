// ═══════════════════════════════════════════════════════════
// 🧪 "I need to think" flow override — yields a paused flow to the AI
// ═══════════════════════════════════════════════════════════
// Behaviour under test (fda9629, still intact in src/lib/flows/engine.ts and
// wired in the WhatsApp webhook, where runFlowsForMessage() === false falls
// through to the AI reply): when a customer paused on a flow's buttons replies
// "I need to think" (button cost_think / i_need_to_think, or the equivalent
// text), the engine clears pending_flow_node and returns false so the AI can
// answer, instead of re-prompting with the flow.
//
// WHY THIS FILE WAS REWRITTEN (2026-09-17): the original was a LIVE production
// integration test. It loaded .env.local (production Supabase service-role
// key), DELETED messages + conversations for a real tenant (Globesome India),
// inserted rows, and ran the real engine — which takes a lock in production
// Redis and can send real WhatsApp messages. It only ever "failed" because
// src/lib/env.ts snapshots process.env at import time, before its
// dotenv.config() call ran, so it threw before reaching the database. Making it
// "pass" that way would have run destructive writes against production on
// every `vitest run`. It now exercises the same engine code with Supabase,
// Redis and Meta mocked, using the real Globesome "Cost OK?" flow shape.
// Run: npx vitest run tests/think-override.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    flows: [] as Row[],
    conversation: { id: '', context: {} as Record<string, unknown>, current_step: null as string | null },
    conversationUpdates: [] as Row[],
  };

  // Permissive chainable builder: every filter returns itself; terminal reads
  // resolve per table. Unrelated tables read as empty.
  const builder = (table: string) => {
    let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
    let payload: Row | null = null;
    const resolve = () => {
      if (op === 'update' && table === 'conversations' && payload) {
        state.conversationUpdates.push(structuredClone(payload));
        if (payload.context) state.conversation.context = structuredClone(payload.context) as Record<string, unknown>;
        return { data: null, error: null };
      }
      if (op !== 'select') return { data: null, error: null };
      if (table === 'automation_flows') return { data: structuredClone(state.flows), error: null };
      if (table === 'tenants') return { data: { wa_access_token: 'ciphertext', wa_phone_number_id: '1098765432', business_name: 'Globesome India' }, error: null };
      if (table === 'conversations') return { data: structuredClone(state.conversation), error: null };
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'gt', 'gte', 'lt', 'lte', 'match', 'contains', 'or']) {
      b[m] = () => b;
    }
    b.update = (p: Row) => { op = 'update'; payload = p; return b; };
    b.insert = (p: Row) => { op = 'insert'; payload = p; return b; };
    b.upsert = (p: Row) => { op = 'upsert'; payload = p; return b; };
    b.delete = () => { op = 'delete'; return b; };
    b.single = async () => resolve();
    b.maybeSingle = async () => resolve();
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
    return b;
  };

  return { state, supabaseAdmin: { from: builder, rpc: async () => ({ data: null, error: null }) } };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: h.supabaseAdmin }));
vi.mock('@/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: (v: string | null) => (v ? 'EAAFakeAccessTokenForTests0123456789' : null),
  encryptToken: (v: string | null) => v,
}));
vi.mock('@/lib/meta/service', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/meta/service')>();
  const sent = { messageId: 'wamid.TEST', status: 'sent' };
  return {
    ...actual,
    sendTextMessage: vi.fn(async () => sent),
    sendMediaMessage: vi.fn(async () => sent),
    sendInteractiveButtonsMessage: vi.fn(async () => sent),
    sendInteractiveListMessage: vi.fn(async () => sent),
  };
});

import { runFlowsForMessage } from '@/lib/flows/engine';
import { sendTextMessage, sendInteractiveButtonsMessage, sendInteractiveListMessage, sendMediaMessage } from '@/lib/meta/service';

const TENANT = 'e29f53cf-0000-4000-8000-000000000000';
const CONV = '77777777-7777-4777-8777-777777777777';
const PHONE = '919000000001';

// The Globesome Zanskar rafting flow around the "Cost OK?" pause (see
// src/app/dashboard/flows/prebuiltFlows.ts, template 'globesome-rafting').
function globesomeFlow() {
  const edge = (source: string, target: string, sourceHandle?: string) => ({ id: `${source}-${target}-${sourceHandle ?? ''}`, source, target, sourceHandle });
  return {
    id: 'flow-globesome',
    name: 'Globesome Zanskar Rafting',
    trigger_type: 'ctwa',
    trigger_keywords: [],
    updated_at: '2026-06-23T00:00:00Z',
    nodes: [
      { id: 'gr1', type: 'ctwa_trigger', data: { label: 'Meta Ad Click', ad_id: '' } },
      { id: 'gr5', type: 'send_buttons', data: { label: 'Cost OK?', message: 'The cost of the expedition is *₹69,999 per person*. Is this okay for you?', buttons: [{ id: 'b4', label: "That's not an issue", value: 'cost_ok' }, { id: 'b5', label: 'I need to think', value: 'cost_think' }] } },
      { id: 'gr6', type: 'condition', data: { label: 'Cost Response', field: 'button_value', operator: '!=', value: 'NEVER_MATCHES' } },
      { id: 'gr7', type: 'send_buttons', data: { label: 'How Many People?', message: 'How many people will be joining? 👥', buttons: [{ id: 'b6', label: 'Just me! (1)', value: 'solo' }, { id: 'b7', label: '2 People', value: 'two' }] } },
      { id: 'gr16', type: 'end', data: { label: 'End' } },
    ],
    edges: [edge('gr5', 'gr6'), edge('gr6', 'gr7', 'true'), edge('gr6', 'gr16', 'false')],
  };
}

function pausedAtCostQuestion() {
  h.state.flows = [globesomeFlow()];
  h.state.conversation = {
    id: CONV,
    current_step: null,
    context: { pending_flow_node: 'gr5', _pending_pause_type: 'buttons', lead_city: 'Delhi' },
  };
  h.state.conversationUpdates.length = 0;
}

const nothingSentToCustomer = () => {
  expect(sendTextMessage).not.toHaveBeenCalled();
  expect(sendInteractiveButtonsMessage).not.toHaveBeenCalled();
  expect(sendInteractiveListMessage).not.toHaveBeenCalled();
  expect(sendMediaMessage).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  pausedAtCostQuestion();
});

describe('I need to think flow override intercept', () => {
  it('should intercept "cost_think" and yield to AI, clearing pending flow state', async () => {
    const flowHandled = await runFlowsForMessage(TENANT, 'I need to think', PHONE, CONV, null, false, 'interactive', 'cost_think');

    // false = not handled by a flow → the webhook falls through to the AI reply
    expect(flowHandled).toBe(false);
    expect(h.state.conversation.context.pending_flow_node ?? null).toBeNull();
    expect(h.state.conversation.context._pending_pause_type ?? null).toBeNull();
    // Unrelated conversation context survives the reset
    expect(h.state.conversation.context.lead_city).toBe('Delhi');
    // The customer is not re-prompted with the flow
    nothingSentToCustomer();
  });

  it.each(['I need to think', 'need to think', '  Let me think ', 'WILL THINK'])(
    'should also intercept text reply %j',
    async (text) => {
      const flowHandled = await runFlowsForMessage(TENANT, text, PHONE, CONV, null, false, 'text');
      expect(flowHandled).toBe(false);
      expect(h.state.conversation.context.pending_flow_node ?? null).toBeNull();
      nothingSentToCustomer();
    }
  );

  it('also honours the generic i_need_to_think button id', async () => {
    expect(await runFlowsForMessage(TENANT, 'Not now', PHONE, CONV, null, false, 'interactive', 'i_need_to_think')).toBe(false);
    expect(h.state.conversation.context.pending_flow_node ?? null).toBeNull();
  });

  it('control: "That\'s not an issue" is NOT intercepted — the flow resumes and asks the next question', async () => {
    const flowHandled = await runFlowsForMessage(TENANT, "That's not an issue", PHONE, CONV, null, false, 'interactive', 'cost_ok');

    expect(flowHandled).toBe(true);
    expect(sendInteractiveButtonsMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(sendInteractiveButtonsMessage).mock.calls[0])).toContain('How many people');
    expect(h.state.conversation.context.pending_flow_node).toBe('gr7');
  });

  it('control: a reply that merely mentions thinking is not treated as the override', async () => {
    await runFlowsForMessage(TENANT, 'I think it is fine', PHONE, CONV, null, false, 'text');
    expect(h.state.conversation.context.pending_flow_node).not.toBeNull();
  });

  it('does nothing special when no flow is paused', async () => {
    h.state.conversation.context = {};
    expect(await runFlowsForMessage(TENANT, 'I need to think', PHONE, CONV, null, false, 'text')).toBe(false);
    expect(h.state.conversationUpdates).toHaveLength(0);
    nothingSentToCustomer();
  });
});
