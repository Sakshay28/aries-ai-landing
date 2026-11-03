// Account pause (unpaid subscription): nothing leaves a paused number, a failed
// lookup never takes other tenants down, and broadcasts are held, not failed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  pausedRows: [] as Array<{ plan_status: string }>,
  lookupError: null as { message: string } | null,
  lookups: 0,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = async () => {
        state.lookups++;
        return { data: state.lookupError ? null : state.pausedRows, error: state.lookupError };
      };
      return chain;
    }),
  },
}));

import { clearPauseCache, isPlanPaused, isWhatsAppNumberPaused, WhatsAppPausedError } from '@/lib/tenant/pause';
import {
  markMessageAsRead,
  sendInteractiveButtonsMessage,
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
  sendTypingIndicator,
} from '@/lib/meta/service';

const TOKEN = 'EAA' + 'x'.repeat(60);
const fetchMock = vi.fn();

beforeEach(() => {
  state.pausedRows = [];
  state.lookupError = null;
  state.lookups = 0;
  clearPauseCache();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPlanPaused', () => {
  it("only 'suspended' pauses. Cancelled tenants that are still live stay untouched", () => {
    expect(isPlanPaused('suspended')).toBe(true);
    for (const s of ['active', 'trialing', 'past_due', 'cancelled', null, undefined]) {
      expect(isPlanPaused(s)).toBe(false);
    }
  });
});

describe('send gate', () => {
  it('blocks every kind of send from a paused number without calling Meta', async () => {
    state.pausedRows = [{ plan_status: 'suspended' }];
    await expect(sendTextMessage(TOKEN, 'P1', '919000000000', 'hi')).rejects.toBeInstanceOf(WhatsAppPausedError);
    await expect(sendTemplateMessage(TOKEN, 'P1', '919000000000', 'tpl')).rejects.toBeInstanceOf(WhatsAppPausedError);
    await expect(sendMediaMessage(TOKEN, 'P1', '919000000000', 'image', 'https://x/y.png')).rejects.toBeInstanceOf(WhatsAppPausedError);
    await expect(
      sendInteractiveButtonsMessage(TOKEN, 'P1', '919000000000', 'hi', [{ id: 'a', title: 'A' }]),
    ).rejects.toBeInstanceOf(WhatsAppPausedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no blue ticks or typing bubble from a paused number', async () => {
    state.pausedRows = [{ plan_status: 'suspended' }];
    await markMessageAsRead(TOKEN, 'P1', 'wamid.in');
    await sendTypingIndicator(TOKEN, 'P1', 'wamid.in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a number that is not paused send normally', async () => {
    await expect(sendTextMessage(TOKEN, 'P2', '919000000000', 'hi')).resolves.toMatchObject({ messageId: 'wamid.1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when the lookup errors, so a DB blip cannot stop other tenants', async () => {
    state.lookupError = { message: 'db down' };
    await expect(sendTextMessage(TOKEN, 'P3', '919000000000', 'hi')).resolves.toMatchObject({ messageId: 'wamid.1' });
  });

  it('keeps blocking a known-paused number through a lookup error', async () => {
    state.pausedRows = [{ plan_status: 'suspended' }];
    vi.useFakeTimers();
    try {
      expect(await isWhatsAppNumberPaused('P4')).toBe(true);
      vi.advanceTimersByTime(61_000);
      state.lookupError = { message: 'db down' };
      expect(await isWhatsAppNumberPaused('P4')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('looks each number up at most once a minute', async () => {
    await isWhatsAppNumberPaused('P5');
    await isWhatsAppNumberPaused('P5');
    await isWhatsAppNumberPaused('P5');
    expect(state.lookups).toBe(1);
  });
});
