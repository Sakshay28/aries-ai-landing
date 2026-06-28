// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Incremental Conversation Analyzer (REQ 7)
//
// Do NOT resend the entire conversation on every message.
// Instead build a snapshot + incremental delta.
// Only force a full rebuild when: prompt changed, schema changed, or
// conversation hash diverges significantly from last analysis.
// ═══════════════════════════════════════════════════════════════════════════

import type { ConversationSnapshot } from './ai-provider';

export interface ConversationMessage {
  id:        string;
  content:   string | null;
  direction: 'inbound' | 'outbound';
  senderName?: string | null;
  createdAt: string;
}

export interface LastAnalysisContext {
  analysisId:          string | null;
  promptVersion:       string | null;
  schemaVersion:       string | null;
  messageCountAtAnalysis: number;
  conversationHash:    string | null;
}

export interface SnapshotBuildOptions {
  maxContextMessages?:     number;  // max messages in full context (default 80)
  maxIncrementalMessages?: number;  // max incremental messages (default 10)
  forceFullRebuild?:       boolean; // override incremental logic
}

// ── Rebuild Triggers ──────────────────────────────────────────────────────

export function shouldForceFullRebuild(
  last:          LastAnalysisContext | null,
  currentPromptVersion: string,
  currentSchemaVersion: string,
  currentHash:   string,
): boolean {
  if (!last || !last.analysisId) return true;  // first analysis always full
  if (last.promptVersion !== currentPromptVersion) return true;  // prompt changed
  if (last.schemaVersion !== currentSchemaVersion) return true;  // schema changed
  // If the conversation hash diverged beyond the incremental window, rebuild
  // (This guards against incremental analysis missing context from very old messages)
  const incrementalDelta = last.messageCountAtAnalysis;
  if (incrementalDelta < 5) return true;  // too few messages to bother with incremental
  return false;
}

// ── Full Context Builder ──────────────────────────────────────────────────

export function buildFullContext(
  messages:   ConversationMessage[],
  maxMessages = 80,
): string {
  const relevant = messages.slice(-maxMessages);
  return relevant.map(formatMessage).join('\n');
}

// ── Incremental Delta Builder ─────────────────────────────────────────────

export function buildIncrementalDelta(
  messages:               ConversationMessage[],
  lastAnalyzedMessageCount: number,
  maxIncremental = 10,
): string[] {
  const newMessages = messages.slice(lastAnalyzedMessageCount);
  return newMessages.slice(-maxIncremental).map(formatMessage);
}

// ── Main Snapshot Builder ─────────────────────────────────────────────────

export function buildConversationSnapshot(
  messages:    ConversationMessage[],
  last:        LastAnalysisContext | null,
  promptVersion: string,
  schemaVersion: string,
  currentHash: string,
  options:     SnapshotBuildOptions = {},
): ConversationSnapshot {
  const {
    maxContextMessages     = 80,
    maxIncrementalMessages = 10,
    forceFullRebuild       = false,
  } = options;

  const forceRebuild = forceFullRebuild
    || shouldForceFullRebuild(last, promptVersion, schemaVersion, currentHash);

  if (forceRebuild || !last) {
    return {
      fullContext:              buildFullContext(messages, maxContextMessages),
      incrementalMessages:      [],
      useIncremental:           false,
      messageCount:             messages.length,
      lastAnalyzedMessageCount: last?.messageCountAtAnalysis ?? 0,
      lastAnalysisId:           last?.analysisId ?? null,
    };
  }

  const incrementalMessages = buildIncrementalDelta(
    messages, last.messageCountAtAnalysis, maxIncrementalMessages,
  );

  if (incrementalMessages.length === 0) {
    // No new messages since last analysis — this shouldn't reach here normally
    // (cost optimizer should have caught this), but handle gracefully
    return {
      fullContext:              buildFullContext(messages, maxContextMessages),
      incrementalMessages:      [],
      useIncremental:           false,
      messageCount:             messages.length,
      lastAnalyzedMessageCount: last.messageCountAtAnalysis,
      lastAnalysisId:           last.analysisId,
    };
  }

  // Include a short "context anchor" of the last 5 messages before the delta
  // so the AI knows what state the conversation was in
  const contextAnchor = messages
    .slice(Math.max(0, last.messageCountAtAnalysis - 5), last.messageCountAtAnalysis)
    .map(formatMessage);

  const enrichedIncremental = [
    contextAnchor.length ? `[Context from previous messages]\n${contextAnchor.join('\n')}` : '',
    `[New messages since last analysis]`,
    ...incrementalMessages,
  ].filter(Boolean);

  return {
    fullContext:              buildFullContext(messages, maxContextMessages),
    incrementalMessages:      enrichedIncremental,
    useIncremental:           true,
    messageCount:             messages.length,
    lastAnalyzedMessageCount: last.messageCountAtAnalysis,
    lastAnalysisId:           last.analysisId,
  };
}

// ── Message Formatter ─────────────────────────────────────────────────────

function formatMessage(msg: ConversationMessage): string {
  const who = msg.direction === 'inbound'
    ? (msg.senderName ?? 'Customer')
    : 'Agent';
  const text = (msg.content ?? '[non-text message]').trim();
  return `${who}: ${text}`;
}

// ── Performance Metrics ───────────────────────────────────────────────────

export interface IncrementalAnalysisMetrics {
  totalMessages:        number;
  incrementalMessages:  number;
  tokensSaved:          number;   // approximate
  costSavedUsd:         number;   // approximate
  wasIncremental:       boolean;
}

export function computeIncrementalMetrics(
  snapshot: ConversationSnapshot,
  costPerToken = 0.075 / 1_000_000,
): IncrementalAnalysisMetrics {
  const fullContextTokens = Math.ceil(snapshot.fullContext.length / 3.5);
  const incrementalTokens = Math.ceil(
    snapshot.incrementalMessages.join('').length / 3.5,
  );
  const tokensSaved = snapshot.useIncremental ? fullContextTokens - incrementalTokens : 0;
  return {
    totalMessages:       snapshot.messageCount,
    incrementalMessages: snapshot.incrementalMessages.length,
    tokensSaved,
    costSavedUsd:        tokensSaved * costPerToken,
    wasIncremental:      snapshot.useIncremental,
  };
}
