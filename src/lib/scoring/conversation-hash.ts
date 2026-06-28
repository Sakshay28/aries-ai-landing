// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Conversation Hash (Point 9)
//
// Computes a stable hash of a conversation's content.
// Used to detect whether conversation has materially changed since the
// last AI analysis — avoiding redundant Gemini calls.
//
// Hash covers: message IDs + content (not timestamps, which change on edits).
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';

export interface HashableMessage {
  id: string;
  content: string | null;
  direction: 'inbound' | 'outbound';
}

// Returns a 16-char hex prefix of SHA-256 over message IDs + content.
// Deterministic: same messages in same order always produce the same hash.
export function computeConversationHash(messages: HashableMessage[]): string {
  if (!messages.length) return 'empty';
  const payload = messages
    .map(m => `${m.direction}:${m.id}:${(m.content ?? '').slice(0, 500)}`)
    .join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// Returns true if the new hash is meaningfully different from the stored one.
// A null stored hash always triggers a new analysis (first run).
export function conversationHashChanged(
  storedHash: string | null | undefined,
  currentHash: string,
): boolean {
  if (!storedHash) return true;
  return storedHash !== currentHash;
}

// Lightweight "has the conversation grown?" check without full hashing.
// Used as a fast pre-filter before computing the full hash.
export function messageCountChanged(
  lastAnalyzedCount: number | null | undefined,
  currentCount: number,
): boolean {
  return (lastAnalyzedCount ?? -1) !== currentCount;
}
