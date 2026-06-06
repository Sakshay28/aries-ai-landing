// ═══════════════════════════════════════════════════════════
// 🧪 V4 Broadcast Engine Service Layers — Unit Tests
// ═══════════════════════════════════════════════════════════
// Run: npx vitest run tests/broadcast-v4-services.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CSVImportService } from '@/lib/broadcast/services/csv-import.service';
import { VariableEngineService } from '@/lib/broadcast/services/variable-engine.service';
import { AudienceEngineService } from '@/lib/broadcast/services/audience-engine.service';
import { LaunchValidatorService } from '@/lib/broadcast/services/launch-validator.service';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('CSVImportService — Spreadsheet Phone Parser', () => {
  it('parses valid comma-separated values correctly', () => {
    const csvData = `Name,Phone\nSakshay,9876543210\nJohn,1234567890`;
    const res = CSVImportService.parseAndValidate(csvData, '91');
    
    expect(res.totalRows).toBe(2);
    expect(res.validCount).toBe(2);
    expect(res.invalidRemoved).toBe(0);
    expect(res.duplicatesRemoved).toBe(0);
    expect(res.previewRows[0].phone).toBe('919876543210');
    expect(res.previewRows[0].isValid).toBe(true);
    expect(res.previewRows[1].phone).toBe('911234567890');
    expect(res.previewRows[1].isValid).toBe(true);
  });

  it('handles missing or invalid phone formats gracefully', () => {
    const csvData = `Name,Phone\nSakshay,9876543210\nBadRow,\nShortRow,123`;
    const res = CSVImportService.parseAndValidate(csvData, '91');

    expect(res.totalRows).toBe(3);
    expect(res.validCount).toBe(1);
    expect(res.invalidRemoved).toBe(2);
  });

  it('removes duplicates strictly within the CSV data', () => {
    const csvData = `Name,Phone\nSakshay,9876543210\nSakshay Dup,9876543210`;
    const res = CSVImportService.parseAndValidate(csvData, '91');

    expect(res.totalRows).toBe(2);
    expect(res.validCount).toBe(1);
    expect(res.duplicatesRemoved).toBe(1);
  });

  it('preserves existing E.164 country prefixes without double prepending', () => {
    const csvData = `Name,Phone\nSakshay,+919876543210\nUSUser,+14155552671`;
    const res = CSVImportService.parseAndValidate(csvData, '91');

    expect(res.validCount).toBe(2);
    expect(res.previewRows[0].phone).toBe('919876543210');
    expect(res.previewRows[1].phone).toBe('14155552671');
  });
});

describe('VariableEngineService — Personalization Resolver', () => {
  const mockLead = {
    id: 'lead-1',
    name: 'Sakshay',
    phone: '919876543210',
    email: 'sakshay@example.com',
    notes: 'Premium lead tier',
    custom_field: 'Special Promo Value'
  };

  it('resolves static or custom mappings correctly', () => {
    const staticCfg = {
      index: '1',
      sourceType: 'static' as const,
      staticValue: 'Awesome Summer Offer'
    };
    const val = VariableEngineService.resolveValue(staticCfg, mockLead);
    expect(val).toBe('Awesome Summer Offer');
  });

  it('resolves crm_field values correctly', () => {
    const nameCfg = {
      index: '1',
      sourceType: 'crm_field' as const,
      crmField: 'name'
    };
    const emailCfg = {
      index: '2',
      sourceType: 'crm_field' as const,
      crmField: 'email'
    };
    const customCfg = {
      index: '3',
      sourceType: 'crm_field' as const,
      crmField: 'custom_field'
    };

    expect(VariableEngineService.resolveValue(nameCfg, mockLead)).toBe('Sakshay');
    expect(VariableEngineService.resolveValue(emailCfg, mockLead)).toBe('sakshay@example.com');
    expect(VariableEngineService.resolveValue(customCfg, mockLead)).toBe('Special Promo Value');
  });

  it('resolves fallbacks when lead data is empty or missing', () => {
    const emptyLead = { id: 'lead-empty', name: null, phone: null };
    const nameCfg = {
      index: '1',
      sourceType: 'crm_field' as const,
      crmField: 'name'
    };
    expect(VariableEngineService.resolveValue(nameCfg, emptyLead)).toBe('there');
  });

  it('validates variable index mapping completeness', () => {
    const validVars = {
      '1': { index: '1', sourceType: 'static' as const, staticValue: 'Hello' },
      '2': { index: '2', sourceType: 'crm_field' as const, crmField: 'name' }
    };
    expect(VariableEngineService.validate(validVars, ['1', '2'])).toBe(true);

    const invalidVars = {
      '1': { index: '1', sourceType: 'static' as const, staticValue: '' },
      '2': { index: '2', sourceType: 'crm_field' as const, crmField: '' }
    };
    expect(VariableEngineService.validate(invalidVars, ['1', '2'])).toBe(false);
  });

  it('builds compliant Meta Graph API parameters body payload', () => {
    const vars = {
      '1': { index: '1', sourceType: 'static' as const, staticValue: 'Discount code: SUM50' },
      '2': { index: '2', sourceType: 'crm_field' as const, crmField: 'name' }
    };
    const payload = VariableEngineService.buildMetaPayload(vars, ['1', '2'], mockLead);
    
    expect(payload).toHaveLength(1);
    expect(payload[0].type).toBe('body');
    expect(payload[0].parameters).toHaveLength(2);
    expect(payload[0].parameters[0]).toEqual({ type: 'text', text: 'Discount code: SUM50' });
    expect(payload[0].parameters[1]).toEqual({ type: 'text', text: 'Sakshay' });
  });
});

describe('AudienceEngineService — Segmentation Filter & Opt-out Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out unsubscribed / opt-out tags strictly', async () => {
    const mockLeads = [
      { id: 'l1', name: 'Sakshay', phone: '919876543210', tags: ['active'] },
      { id: 'l2', name: 'Opted Out User', phone: '912233445566', tags: ['Opt-Out'] },
      { id: 'l3', name: 'Unsub User', phone: '919988776655', tags: ['Unsubscribe'] },
      { id: 'l4', name: 'Stop User', phone: '915566778899', tags: ['stop'] }
    ];

    const makeChain = (data: any) => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.not = vi.fn().mockReturnValue(chain);
      chain.overlaps = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: any) => resolve({ data, error: null });
      return chain;
    };
    
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'leads') return makeChain(mockLeads);
      if (table === 'broadcast_optouts') return makeChain([]);
      return makeChain(null);
    });

    const res = await AudienceEngineService.resolveAudience('tenant-1', {
      type: 'all',
      tags: [],
      customFilters: [],
      retargetCampaignId: null,
      retargetCondition: 'unread',
      retargetDelayDays: 1
    });

    expect(res.total).toBe(1);
    expect(res.contacts[0].id).toBe('l1');
    expect(res.optedOutRemoved).toBe(3);
  });

  it('performs strict duplicate check on contacts phone numbers', async () => {
    const duplicateLeads = [
      { id: 'l1', name: 'Sakshay', phone: '919876543210' },
      { id: 'l2', name: 'Duplicate Sakshay', phone: '919876543210' }
    ];

    const makeChain = (data: any) => {
      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.not = vi.fn().mockReturnValue(chain);
      chain.overlaps = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: any) => resolve({ data, error: null });
      return chain;
    };

    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      if (table === 'leads') return makeChain(duplicateLeads);
      if (table === 'broadcast_optouts') return makeChain([]);
      return makeChain(null);
    });

    const res = await AudienceEngineService.resolveAudience('tenant-1', {
      type: 'all',
      tags: [],
      customFilters: [],
      retargetCampaignId: null,
      retargetCondition: 'unread',
      retargetDelayDays: 1
    });

    expect(res.total).toBe(1);
    expect(res.duplicatesRemoved).toBe(1);
    expect(res.contacts[0].id).toBe('l1');
  });
});

describe('LaunchValidatorService — Launch Timeline Readiness Checker', () => {
  it('blocks campaigns missing critical variables mappings', () => {
    const campaignVal = {
      name: 'Summer Promo Campaign',
      template_name: 'summer_promo',
      audience: {
        type: 'all' as const,
        tags: [],
        customFilters: [],
        retargetCampaignId: null,
        retargetCondition: 'unread' as const,
        retargetDelayDays: 1,
        manualContactIds: [],
        csvFile: null,
      },
      delivery: {
        mode: 'now' as const,
        scheduledAt: null,
        timezone: 'Asia/Kolkata',
        quietHoursEnabled: true,
        throttleRate: 300,
        advancedOpen: false
      }
    };
    
    // We detect variable index '1' in template, but provide 0 mapping indices
    const res = LaunchValidatorService.validate(campaignVal, ['1'], 10);
    
    expect(res.ready).toBe(false);
    expect(res.blockers).toContain('1 variable unmapped');
    expect(res.confidenceScore).toBeLessThan(100);
  });

  it('allows perfectly mapped campaigns to launch successfully', () => {
    const campaignVal = {
      name: 'Autumn Campaign',
      template_name: 'autumn_offers',
      audience: {
        type: 'all' as const,
        tags: [],
        customFilters: [],
        retargetCampaignId: null,
        retargetCondition: 'unread' as const,
        retargetDelayDays: 1,
        manualContactIds: [],
        csvFile: null,
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
        '1': { 
          index: '1',
          sourceType: 'static' as const, 
          staticValue: 'Autumn Fest' 
        }
      }
    };

    const res = LaunchValidatorService.validate(campaignVal, ['1'], 15);

    expect(res.ready).toBe(true);
    expect(res.blockers).toHaveLength(0);
    expect(res.confidenceScore).toBe(100);
  });
});
