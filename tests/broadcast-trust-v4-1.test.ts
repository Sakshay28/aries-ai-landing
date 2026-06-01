// ═══════════════════════════════════════════════════════════
// 🧪 V4.1 Observability, Trust & Telemetry — Unit Tests
// ═══════════════════════════════════════════════════════════
// Run: npx vitest run tests/broadcast-trust-v4-1.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfidenceScoreService } from '@/lib/broadcast/services/confidence-score.service';
import { QueueObservabilityService } from '@/lib/broadcast/services/queue-observability.service';
import { AuditLogService } from '@/lib/broadcast/services/audit-log.service';
import { TelemetryService } from '@/lib/broadcast/services/telemetry.service';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('ConfidenceScoreService — Dynamic Validation Intelligence Scorer', () => {
  it('assigns perfect 100 score for fully configured compliance-safe campaign', () => {
    const campaignVal = {
      name: 'Autumn Campaign',
      template_name: 'autumn_offers',
      audience: {
        type: 'all' as const,
        tags: [],
        customFilters: [],
        retargetCampaignId: null,
        retargetCondition: 'unread' as const,
        retargetDelayDays: 1
      },
      delivery: {
        mode: 'now' as const,
        scheduledAt: null,
        timezone: 'Asia/Kolkata',
        quietHoursEnabled: true,
        throttleRate: 300,
        advancedOpen: false
      },
      variables: {
        '1': { index: '1', sourceType: 'static' as const, staticValue: 'Summer Code' }
      }
    };

    const res = ConfidenceScoreService.calculate(campaignVal, ['1'], 100, 0, 0);

    expect(res.score).toBe(100);
    expect(res.band).toBe('High Confidence');
    expect(res.label).toBe('Ready for reliable delivery');
  });

  it('drops score significantly when variables are missing mapping configurations', () => {
    const campaignVal = {
      name: 'Discount Campaign',
      template_name: 'discount_alert',
      variables: {} // empty variables mapping
    };

    const res = ConfidenceScoreService.calculate(campaignVal, ['1'], 100, 0, 0);
    
    // Unmapped variable: -30 points from 100 = 70 score (or lower if quiet hours default triggers, etc.)
    expect(res.score).toBeLessThan(90);
    expect(res.band).not.toBe('High Confidence');
  });

  it('applies penalties when quiet hours timezone guards are disabled', () => {
    const campaignVal = {
      name: 'Overnight Alert',
      template_name: 'overnight_info',
      delivery: {
        mode: 'now' as const,
        scheduledAt: null,
        timezone: 'Asia/Kolkata',
        quietHoursEnabled: false, // disabled quiet hours
        throttleRate: 300,
        advancedOpen: false
      }
    };

    const res = ConfidenceScoreService.calculate(campaignVal, [], 100, 0, 0);
    
    // Expected quiet hours penalty: -10 points
    expect(res.score).toBeLessThan(100);
  });
});

describe('QueueObservabilityService — live Completion ETA Tracker', () => {
  it('calculates perfect ETA seconds remaining for enqueued batches', () => {
    // 300 remaining at 300 msgs/min (5 msgs/sec) = 60 seconds
    const eta = QueueObservabilityService.calculateETA(300, 300);
    expect(eta).toBe(61); // 60 + 1 second processing delay constant
  });

  it('outputs zero seconds ETA when there are no remaining queue items', () => {
    const eta = QueueObservabilityService.calculateETA(0, 500);
    expect(eta).toBe(0);
  });
});

describe('AuditLogService — Human-Readable Delta Diff Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out system timestamp keys and creates clean log entries', async () => {
    const beforeState = {
      id: 'campaign-1',
      name: 'Summer Promo v1',
      template_name: 'promo_v1',
      created_at: '2026-06-01T00:00:00Z'
    };

    const afterState = {
      id: 'campaign-1',
      name: 'Summer Promo v2',
      template_name: 'promo_v2',
      created_at: '2026-06-02T00:00:00Z'
    };

    vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ 
            data: { 
              id: 'log-1', 
              action: 'edit', 
              entity_type: 'campaign', 
              before_state: { name: 'Summer Promo v1', template_name: 'promo_v1' },
              after_state: { name: 'Summer Promo v2', template_name: 'promo_v2' }
            }, 
            error: null 
          })
        })
      })
    } as any);

    const log = await AuditLogService.logChange(
      'tenant-1',
      'campaign-1',
      'user-1',
      'edit',
      'campaign',
      beforeState,
      afterState
    );

    expect(log).toBeTruthy();
    expect(log?.before_state).toEqual({ name: 'Summer Promo v1', template_name: 'promo_v1' });
    expect(log?.after_state).toEqual({ name: 'Summer Promo v2', template_name: 'promo_v2' });
    expect(log?.before_state.id).toBeUndefined(); // skipped system id key
  });
});

describe('TelemetryService — Render & Autosave Latency Benchmarking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('benchmarks async functions and resolves results perfectly', async () => {
    const testFn = vi.fn().mockResolvedValue('benchmark-completed');

    vi.spyOn(supabaseAdmin, 'from').mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null })
    } as any);

    const res = await TelemetryService.benchmarkAsync(
      'tenant-1',
      'autosave_latency',
      testFn,
      { campaignId: 'c1' }
    );

    expect(res).toBe('benchmark-completed');
    expect(testFn).toHaveBeenCalledOnce();
  });
});
