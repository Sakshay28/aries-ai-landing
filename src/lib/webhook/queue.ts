// ═══════════════════════════════════════════════════════════
// Webhook Queue — Synchronous fallback
// ═══════════════════════════════════════════════════════════
import { processIncomingIGMessage } from '@/lib/instagram/processor';

export function initWebhookEngine() {
  // No-op on Vercel
}

export async function enqueueIGWebhookMessage(data: { igPageId: string, senderId: string, messageText: string, messageId: string }) {
  processIncomingIGMessage(data.igPageId, data.senderId, data.messageText, data.messageId).catch(console.error);
}
