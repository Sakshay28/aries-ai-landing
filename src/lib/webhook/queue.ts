// ═══════════════════════════════════════════════════════════
// Webhook Queue — Synchronous fallback (BullMQ in worker service)
// ═══════════════════════════════════════════════════════════
import { processIncomingMessage } from '@/lib/whatsapp/processor';
import { processIncomingIGMessage } from '@/lib/instagram/processor';
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp/service';
import * as Sentry from '@/lib/sentry-stub';

export function initWebhookEngine() {
  // No-op on Vercel — worker handles queues
}

export async function enqueueWebhookMessage(msg: ParsedWhatsAppMessage) {
  processIncomingMessage(msg).catch((err) => {
    console.error(err);
    Sentry.captureException(err);
  });
}

export async function enqueueIGWebhookMessage(data: { igPageId: string, senderId: string, messageText: string, messageId: string }) {
  processIncomingIGMessage(data.igPageId, data.senderId, data.messageText, data.messageId).catch(console.error);
}
