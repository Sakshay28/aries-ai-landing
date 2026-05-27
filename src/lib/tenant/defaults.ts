// ═══════════════════════════════════════════════════════════
// ⚙️ Tenant Config Defaults & Misconfiguration Guard
// ═══════════════════════════════════════════════════════════
// Protects against:
//  - Empty greeting message → safe default
//  - Missing working hours  → 24/7 fallback
//  - Broken API key         → warning flag in tenant config
//  - Bot live with no published flow → fallback assistant message
// ═══════════════════════════════════════════════════════════

import type { Tenant } from '@/lib/types';

export const DEFAULT_GREETING =
  "Hi there! 👋 Thanks for reaching out. How can I help you today?";

export const DEFAULT_OFF_HOURS_MESSAGE =
  "We're currently closed. Our team will get back to you during business hours. Thank you for your patience! 🙏";

export const DEFAULT_WORKING_HOURS = {
  enabled: false,   // false = 24/7
  timezone: 'Asia/Kolkata',
  schedule: {
    mon: { open: '09:00', close: '21:00' },
    tue: { open: '09:00', close: '21:00' },
    wed: { open: '09:00', close: '21:00' },
    thu: { open: '09:00', close: '21:00' },
    fri: { open: '09:00', close: '21:00' },
    sat: { open: '10:00', close: '18:00' },
    sun: { open: '10:00', close: '18:00' },
  },
};

export const FALLBACK_NO_FLOW_MESSAGE =
  "Hi! I'm here to help 😊 Our team will be with you shortly. Meanwhile, feel free to describe what you need!";

// ─── Misconfiguration issues ──────────────────────────────────
export interface MisconfigIssue {
  field: string;
  severity: 'warning' | 'error';
  message: string;
  fallbackApplied?: string;
}

// ─── Audit a tenant config for misconfigurations ─────────────
export function auditTenantConfig(tenant: Partial<Tenant>): MisconfigIssue[] {
  const issues: MisconfigIssue[] = [];

  // Empty or missing greeting
  if (!tenant.welcome_message?.trim()) {
    issues.push({
      field: 'welcome_message',
      severity: 'warning',
      message: 'Welcome message is empty — default greeting will be used',
      fallbackApplied: DEFAULT_GREETING,
    });
  }

  // Missing working hours config (treated as 24/7 — not an error, just inform)
  if (!tenant.working_hours) {
    issues.push({
      field: 'working_hours',
      severity: 'warning',
      message: 'No working hours configured — bot will respond 24/7',
      fallbackApplied: '24/7 (always on)',
    });
  }

  // Missing WhatsApp credentials
  if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
    issues.push({
      field: 'wa_credentials',
      severity: 'error',
      message: 'WhatsApp API credentials missing — bot cannot send messages',
    });
  }

  // Bot name missing
  if (!tenant.bot_name?.trim()) {
    issues.push({
      field: 'bot_name',
      severity: 'warning',
      message: 'Bot name not set — will default to "Assistant"',
      fallbackApplied: 'Assistant',
    });
  }

  return issues;
}

// ─── Apply safe defaults to tenant config ────────────────────
// Returns a config with missing fields filled with safe defaults
export function applyTenantDefaults(tenant: Partial<Tenant>): Partial<Tenant> {
  return {
    ...tenant,
    welcome_message: tenant.welcome_message?.trim() || DEFAULT_GREETING,
    bot_name: tenant.bot_name?.trim() || 'Assistant',
    off_hours_message: tenant.off_hours_message?.trim() || DEFAULT_OFF_HOURS_MESSAGE,
    working_hours: tenant.working_hours || (DEFAULT_WORKING_HOURS as unknown as Record<string, string>),
  };
}
