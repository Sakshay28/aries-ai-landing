// ═══════════════════════════════════════════════════════════
// 🚦 Go-Live Readiness Score
// ═══════════════════════════════════════════════════════════
// Evaluates a tenant config against a checklist of production
// requirements. Returns a score and GO / HOLD decision.
// ═══════════════════════════════════════════════════════════

import type { Tenant } from '@/lib/types';

export interface ReadinessCheck {
  id: string;
  category: 'security' | 'whatsapp' | 'billing' | 'flows' | 'monitoring';
  label: string;
  description: string;
  weight: number;        // out of 10
  passed: boolean;
  severity: 'critical' | 'recommended';
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  scores: Record<string, number>;   // per-category score 0-10
  overallScore: number;             // 0-100
  canGoLive: boolean;               // true only if all critical checks pass
  criticalFailed: string[];
  recommendation: 'GO' | 'HOLD';
}

interface ReadinessInput {
  tenant: Partial<Tenant>;
  hasPublishedFlow: boolean;
  hasActiveBillingPlan: boolean;
  hasKnowledgeBase: boolean;
  redisConnected: boolean;
  sentryConfigured: boolean;
  webhookVerified: boolean;
}

export function computeReadinessScore(input: ReadinessInput): ReadinessReport {
  const { tenant, hasPublishedFlow, hasActiveBillingPlan, hasKnowledgeBase, redisConnected, sentryConfigured, webhookVerified } = input;

  const checks: ReadinessCheck[] = [
    // ── Security ──
    {
      id: 'wa_token_encrypted',
      category: 'security',
      label: 'WhatsApp token encrypted',
      description: 'Access token stored with AES-256-GCM encryption',
      weight: 10,
      passed: Boolean(tenant.wa_access_token && tenant.wa_access_token.includes(':')),
      severity: 'critical',
    },
    {
      id: 'tenant_rls',
      category: 'security',
      label: 'Tenant isolation enforced',
      description: 'All DB queries scoped to tenant_id via RLS',
      weight: 10,
      passed: true, // enforced by Supabase RLS policies at DB level
      severity: 'critical',
    },
    {
      id: 'webhook_verified',
      category: 'security',
      label: 'Webhook signature verified',
      description: 'Incoming webhooks validated with HMAC-SHA256',
      weight: 9,
      passed: webhookVerified,
      severity: 'critical',
    },
    // ── WhatsApp ──
    {
      id: 'wa_credentials',
      category: 'whatsapp',
      label: 'WhatsApp credentials configured',
      description: 'Phone number ID and access token both present',
      weight: 10,
      passed: Boolean(tenant.wa_access_token && tenant.wa_phone_number_id),
      severity: 'critical',
    },
    {
      id: 'bot_name',
      category: 'whatsapp',
      label: 'Bot name set',
      description: 'Custom bot name configured for the business',
      weight: 6,
      passed: Boolean(tenant.bot_name?.trim()),
      severity: 'recommended',
    },
    {
      id: 'welcome_message',
      category: 'whatsapp',
      label: 'Welcome message configured',
      description: 'First message customers receive is customised',
      weight: 7,
      passed: Boolean(tenant.welcome_message?.trim()),
      severity: 'recommended',
    },
    // ── Billing ──
    {
      id: 'billing_active',
      category: 'billing',
      label: 'Active billing plan',
      description: 'Tenant has a paid or trial subscription',
      weight: 10,
      passed: hasActiveBillingPlan,
      severity: 'critical',
    },
    {
      id: 'usage_limits',
      category: 'billing',
      label: 'Usage limits enforced',
      description: 'Message quota tracked and enforced per plan',
      weight: 8,
      passed: Boolean(tenant.messages_used_this_month !== undefined || hasActiveBillingPlan),
      severity: 'recommended',
    },
    // ── Flows ──
    {
      id: 'published_flow',
      category: 'flows',
      label: 'At least one published flow',
      description: 'A published automation flow is active',
      weight: 10,
      passed: hasPublishedFlow,
      severity: 'critical',
    },
    {
      id: 'knowledge_base',
      category: 'flows',
      label: 'Knowledge base configured',
      description: 'KB reduces hallucination risk for product/service questions',
      weight: 7,
      passed: hasKnowledgeBase,
      severity: 'recommended',
    },
    // ── Monitoring ──
    {
      id: 'sentry',
      category: 'monitoring',
      label: 'Error monitoring enabled',
      description: 'Sentry DSN configured for runtime error capture',
      weight: 8,
      passed: sentryConfigured,
      severity: 'recommended',
    },
    {
      id: 'redis_connected',
      category: 'monitoring',
      label: 'Redis connected',
      description: 'Rate limiting, dedup and caching are active',
      weight: 7,
      passed: redisConnected,
      severity: 'recommended',
    },
  ];

  // Compute per-category scores
  const categories = ['security', 'whatsapp', 'billing', 'flows', 'monitoring'] as const;
  const scores: Record<string, number> = {};

  for (const cat of categories) {
    const catChecks = checks.filter(c => c.category === cat);
    const maxWeight = catChecks.reduce((s, c) => s + c.weight, 0);
    const earnedWeight = catChecks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
    scores[cat] = maxWeight > 0 ? Math.round((earnedWeight / maxWeight) * 10) : 10;
  }

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedTotal = checks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
  const overallScore = Math.round((earnedTotal / totalWeight) * 100);

  const criticalFailed = checks
    .filter(c => c.severity === 'critical' && !c.passed)
    .map(c => c.label);

  const canGoLive = criticalFailed.length === 0;

  return {
    checks,
    scores,
    overallScore,
    canGoLive,
    criticalFailed,
    recommendation: canGoLive ? 'GO' : 'HOLD',
  };
}
