import { describe, it, expect } from 'vitest';
import {
  matchesTab,
  isAssignedToMe,
  matchesInboxView,
  type InboxConversation,
  type InboxTab,
} from '../src/lib/chat/inbox-filter';

// ─── Fixtures ────────────────────────────────────────────────────────────────
const AGENT_A = 'user-aaa';
const AGENT_B = 'user-bbb';

function conv(over: Partial<InboxConversation>): InboxConversation {
  return { bot_paused: false, escalated: false, assigned_to: null, ...over };
}

// A chat a human has taken over: assigned to A, bot paused (human mode).
const takenOverByA = conv({ assigned_to: AGENT_A, bot_paused: true });
// A live AI chat assigned to A.
const aiChatOfA = conv({ assigned_to: AGENT_A, bot_paused: false });
// An escalated chat assigned to A (customer asked for a human, not yet taken over).
const escalatedOfA = conv({ assigned_to: AGENT_A, escalated: true, bot_paused: false });
// A chat assigned to B, in human mode.
const takenOverByB = conv({ assigned_to: AGENT_B, bot_paused: true });
// An unassigned live chat.
const unassigned = conv({ assigned_to: null, bot_paused: false });

describe('isAssignedToMe', () => {
  it('matches when assigned_to === me', () => {
    expect(isAssignedToMe(aiChatOfA, AGENT_A)).toBe(true);
  });
  it('does not match another agent', () => {
    expect(isAssignedToMe(aiChatOfA, AGENT_B)).toBe(false);
  });
  it('never matches when me is unknown (null/undefined/empty)', () => {
    expect(isAssignedToMe(aiChatOfA, null)).toBe(false);
    expect(isAssignedToMe(aiChatOfA, undefined)).toBe(false);
    expect(isAssignedToMe(aiChatOfA, '')).toBe(false);
    // and an unassigned conversation must not match a null viewer
    expect(isAssignedToMe(unassigned, null)).toBe(false);
  });
});

describe('matchesTab (state tabs / counts)', () => {
  it('active tab = AI handling (not paused)', () => {
    expect(matchesTab(aiChatOfA, 'active')).toBe(true);
    expect(matchesTab(takenOverByA, 'active')).toBe(false); // paused → hidden from Active
  });
  it('intervened tab = human took over (paused)', () => {
    expect(matchesTab(takenOverByA, 'intervened')).toBe(true);
    expect(matchesTab(aiChatOfA, 'intervened')).toBe(false);
  });
  it('requesting tab = escalated', () => {
    expect(matchesTab(escalatedOfA, 'requesting')).toBe(true);
    expect(matchesTab(aiChatOfA, 'requesting')).toBe(false);
  });
});

describe('matchesInboxView — "Assigned to me" is an assignment view, not a state view', () => {
  const tabs: InboxTab[] = ['active', 'requesting', 'intervened'];

  it('REGRESSION: a taken-over (bot_paused) chat assigned to me shows under "Assigned to me" on EVERY tab', () => {
    // This is the exact bug: mineOnly used to be AND-ed with the tab, and the
    // default Active tab drops bot_paused, so handed-off chats vanished.
    for (const activeTab of tabs) {
      expect(matchesInboxView(takenOverByA, { mineOnly: true, me: AGENT_A, activeTab })).toBe(true);
    }
  });

  it('shows AI + escalated + taken-over chats assigned to me, regardless of the active tab', () => {
    for (const c of [aiChatOfA, escalatedOfA, takenOverByA]) {
      expect(matchesInboxView(c, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(true);
    }
  });

  it('excludes chats assigned to another agent', () => {
    expect(matchesInboxView(takenOverByB, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(false);
    expect(matchesInboxView(unassigned, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(false);
  });

  it('reassignment: A→B removes it from A and adds it to B', () => {
    const before = conv({ assigned_to: AGENT_A, bot_paused: true });
    expect(matchesInboxView(before, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(true);
    expect(matchesInboxView(before, { mineOnly: true, me: AGENT_B, activeTab: 'active' })).toBe(false);

    const after = conv({ assigned_to: AGENT_B, bot_paused: true });
    expect(matchesInboxView(after, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(false);
    expect(matchesInboxView(after, { mineOnly: true, me: AGENT_B, activeTab: 'active' })).toBe(true);
  });

  it('multi-tenant: assigned_to values are opaque users.id — a different tenant\'s agent id never matches', () => {
    // Tenant isolation is enforced at the query layer (server fetches only this
    // tenant\'s conversations); the predicate itself must never cross-match ids.
    const otherTenantConv = conv({ assigned_to: 'user-from-tenant-2', bot_paused: true });
    expect(matchesInboxView(otherTenantConv, { mineOnly: true, me: AGENT_A, activeTab: 'active' })).toBe(false);
  });

  it('"All chats" (mineOnly=false) still applies pure state-tab filtering', () => {
    // Active hides paused; Intervened shows paused; Requesting shows escalated.
    expect(matchesInboxView(takenOverByA, { mineOnly: false, me: AGENT_A, activeTab: 'active' })).toBe(false);
    expect(matchesInboxView(takenOverByA, { mineOnly: false, me: AGENT_A, activeTab: 'intervened' })).toBe(true);
    expect(matchesInboxView(escalatedOfA, { mineOnly: false, me: AGENT_A, activeTab: 'requesting' })).toBe(true);
    expect(matchesInboxView(aiChatOfA, { mineOnly: false, me: AGENT_A, activeTab: 'active' })).toBe(true);
  });
});

describe('assigned count (drives the badge)', () => {
  it('counts every conversation assigned to me irrespective of state', () => {
    const list = [aiChatOfA, escalatedOfA, takenOverByA, takenOverByB, unassigned];
    const mine = list.filter(c => isAssignedToMe(c, AGENT_A));
    expect(mine.length).toBe(3);
  });
});
