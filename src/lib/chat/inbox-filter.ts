// ═══════════════════════════════════════════════════════════════════════════
// Live-Chat Inbox filtering — single source of truth for BOTH the sidebar list
// and its tab/badge counts. Extracted from ChatSidebar.tsx so the exact
// predicate that decides "does this conversation show under Assigned to me?"
// is pure and unit-testable (see tests/inbox-assigned-filter.test.ts).
//
// Assignment model (verified across the codebase):
//   • The canonical assignee is `leads.assigned_to`, a `users.id`.
//   • `getCurrentUser().id` (surfaced to the client as `me`) is the SAME
//     `users.id` space, so `conversation.assigned_to === me` is a valid match.
//   • The conversations API copies `leads.assigned_to` onto each conversation
//     row as `assigned_to`, which is what these helpers compare against.
// ═══════════════════════════════════════════════════════════════════════════

export type InboxTab = 'active' | 'requesting' | 'intervened';

export interface InboxConversation {
  assigned_to?: string | null;
  escalated?: boolean;
  bot_paused: boolean;
}

/**
 * State tab predicate — classifies a conversation by AI/human state.
 *   • active     → AI is handling it (bot NOT paused)
 *   • requesting → customer escalated / asked for a human
 *   • intervened → a human has taken over (bot paused)
 * Used for the tab list ("All chats" view) and every tab count badge.
 */
export function matchesTab(c: InboxConversation, tab: InboxTab): boolean {
  if (tab === 'requesting') return !!c.escalated;
  if (tab === 'intervened') return !!c.bot_paused;
  return !c.bot_paused; // 'active'
}

/**
 * Assignment predicate — is this conversation assigned to the current user?
 * Returns false when `me` is unknown so an unauthenticated/loading state never
 * accidentally matches everything.
 */
export function isAssignedToMe(c: InboxConversation, me: string | null | undefined): boolean {
  return !!me && c.assigned_to === me;
}

export interface InboxViewOptions {
  mineOnly: boolean;
  me: string | null | undefined;
  activeTab: InboxTab;
}

/**
 * Master inbox predicate (state + assignment; search is applied separately).
 *
 * "Assigned to me" is an ASSIGNMENT view, not a state view: when `mineOnly`
 * is on it returns EVERY conversation assigned to the current user regardless
 * of AI/human state. This is the core bug fix — previously the mineOnly flag
 * was AND-ed with the active/requesting/intervened tab, and the default
 * `active` tab excludes `bot_paused` conversations. Because a chat a human has
 * taken over is `bot_paused = true`, "Assigned to me" (which sits on the
 * default Active tab) silently dropped exactly the conversations the agent was
 * handling, so the tab always looked empty.
 */
export function matchesInboxView(c: InboxConversation, opts: InboxViewOptions): boolean {
  if (opts.mineOnly) return isAssignedToMe(c, opts.me);
  return matchesTab(c, opts.activeTab);
}
