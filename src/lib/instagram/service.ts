import type { Tenant } from '@/lib/types';
import { decryptToken } from '@/lib/utils/crypto';

// ═══════════════════════════════════════════════════════════
// 📸 Instagram Service
// ═══════════════════════════════════════════════════════════

export function isInstagramConfigured(tenant: Tenant): boolean {
  return Boolean(tenant.ig_access_token && tenant.ig_page_id);
}

export async function sendInstagramMessage(tenant: Tenant, recipientId: string, text: string) {
  if (!isInstagramConfigured(tenant)) {
    throw new Error('Instagram is not configured for this tenant.');
  }

  const token = decryptToken(tenant.ig_access_token);
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;

  const payload = {
    recipient: { id: recipientId },
    message: { text }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Instagram API Error:', data);
    throw new Error(data.error?.message || 'Failed to send Instagram message');
  }

  return data;
}

export async function markInstagramAsRead(tenant: Tenant, messageId: string) {
  if (!isInstagramConfigured(tenant)) return;

  const token = decryptToken(tenant.ig_access_token);
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;

  const payload = {
    recipient: { id: messageId }, // For IG, read receipts are sent slightly differently, often 'sender_action': 'mark_seen'
    sender_action: 'mark_seen'
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Failed to mark IG message as read', error);
  }
}
