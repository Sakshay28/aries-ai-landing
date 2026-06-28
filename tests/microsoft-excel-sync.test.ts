import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock DB and crypto dependencies
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/utils/crypto', () => ({
  encryptToken: (t: string | null) => (t ? `enc:${t}` : null),
  decryptToken: (t: string | null) => (t ? t.replace(/^enc:/, '') : null),
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { syncCustomerToExcel, DEFAULT_COLUMN_MAPPINGS } from '@/lib/integrations/microsoft-excel';
import { MicrosoftExcelWorkerService } from '@/lib/integrations/microsoft-excel-worker';

type Result = { data?: any; error?: any };
type Handler = Result | ((table: string) => Result);

function setupMockDb(config: Record<string, Handler>) {
  const writes = {
    inserts: [] as { table: string; arg: any }[],
    updates: [] as { table: string; arg: any }[],
    deletes: [] as { table: string; query: any }[],
  };

  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    const chain: any = {};
    const filters: any = {};
    const methods = new Set<string>();

    const filterOps = ['select', 'eq', 'order', 'limit', 'maybeSingle', 'single', 'in'];
    for (const f of filterOps) {
      chain[f] = vi.fn((...args: any[]) => {
        methods.add(f);
        if (f === 'eq') {
          filters[args[0]] = args[1];
        }
        return chain;
      });
    }

    chain.insert = vi.fn((arg: any) => {
      methods.add('insert');
      writes.inserts.push({ table, arg });
      return chain;
    });

    chain.update = vi.fn((arg: any) => {
      methods.add('update');
      writes.updates.push({ table, arg });
      return chain;
    });

    chain.delete = vi.fn(() => {
      methods.add('delete');
      writes.deletes.push({ table, query: { ...filters } });
      return chain;
    });

    const resolve = (): Result => {
      const op = methods.has('insert') ? 'insert'
               : methods.has('update') ? 'update'
               : methods.has('delete') ? 'delete' : 'select';
      
      const key = `${table}:${op}`;
      const handler = config[key];
      const res = typeof handler === 'function' ? handler(table) : handler;
      return res ?? { data: null, error: null };
    };

    chain.then = (onResolve: (v: Result) => void) => onResolve(resolve());
    return chain;
  });

  return writes;
}

describe('Microsoft Excel Real-time Synchronization CRM Mirror', () => {
  const TENANT_ID = 'tenant-123';
  const CUSTOMER_PHONE = '+919876543210';
  
  let fetchSpy = vi.spyOn(global, 'fetch');
  let dbWrites: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('syncCustomerToExcel - appends new customer if phone number is not found', async () => {
    // Mock database records
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() + 3600000,
            spreadsheet_id: 'workbook-abc',
            sheet_name: 'Leads',
          },
          is_active: true,
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          tenant_id: TENANT_ID,
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          channel: 'whatsapp',
          lead_status: 'new',
          created_at: '2026-06-27T12:00:00Z',
          updated_at: '2026-06-27T12:00:00Z',
        },
      },
      'messages:select': { data: null },
      'microsoft_excel_audit_logs:insert': { data: [] },
    });

    // Mock Microsoft Graph API fetch requests
    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      // 1. Worksheets list
      if (urlStr.endsWith('/workbook/worksheets')) {
        return Promise.resolve(new Response(JSON.stringify({
          value: [{ name: 'Leads' }]
        }), { status: 200 }));
      }
      
      // 2. Read used range
      if (urlStr.includes('/workbook/worksheets/Leads/usedRange')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [
            Object.keys(DEFAULT_COLUMN_MAPPINGS),
            ['Some Name', '+919999888877', 'WhatsApp', 'new', '', '', '', '', '', '']
          ]
        }), { status: 200 }));
      }

      // 3. Write row (patching range A3:J3)
      if (urlStr.includes('/workbook/worksheets/Leads/range(address=\'A3:J3\')')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      return Promise.reject(new Error(`Unhandled fetch url: ${urlStr}`));
    });

    const res = await syncCustomerToExcel(TENANT_ID, CUSTOMER_PHONE);
    
    expect(res.action).toBe('create');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('syncCustomerToExcel - updates existing row if phone number is found (deduplication)', async () => {
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() + 3600000,
            spreadsheet_id: 'workbook-abc',
            sheet_name: 'Leads',
          },
          is_active: true,
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          tenant_id: TENANT_ID,
          name: 'Sakshay Gupta Edited',
          phone: CUSTOMER_PHONE,
          channel: 'whatsapp',
          lead_status: 'Qualified',
          created_at: '2026-06-27T12:00:00Z',
          updated_at: '2026-06-27T12:00:00Z',
        },
      },
      'messages:select': { data: null },
      'microsoft_excel_audit_logs:insert': { data: [] },
    });

    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      if (urlStr.endsWith('/workbook/worksheets')) {
        return Promise.resolve(new Response(JSON.stringify({
          value: [{ name: 'Leads' }]
        }), { status: 200 }));
      }
      
      if (urlStr.includes('/workbook/worksheets/Leads/usedRange')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [
            Object.keys(DEFAULT_COLUMN_MAPPINGS),
            ['Sakshay Gupta', '+919876543210', 'WhatsApp', 'new', '', '', '', '', '', ''] // Found at row 2 (index 1)
          ]
        }), { status: 200 }));
      }

      if (urlStr.includes('/workbook/worksheets/Leads/range(address=\'A2:J2\')')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      return Promise.reject(new Error(`Unhandled fetch url: ${urlStr}`));
    });

    const res = await syncCustomerToExcel(TENANT_ID, CUSTOMER_PHONE);
    
    expect(res.action).toBe('update');
  });

  it('syncCustomerToExcel - auto-refreshes tokens proactively when credentials have expired', async () => {
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-expired',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() - 5000, // Expired
            spreadsheet_id: 'workbook-abc',
            sheet_name: 'Leads',
          },
          is_active: true,
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          channel: 'whatsapp',
        },
      },
      'messages:select': { data: null },
      'microsoft_excel_audit_logs:insert': { data: [] },
      'tenant_integrations:update': { data: [] },
    });

    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      // Token Refresh API
      if (urlStr.includes('/oauth2/v2.0/token')) {
        return Promise.resolve(new Response(JSON.stringify({
          access_token: 'new-token-456',
          refresh_token: 'new-refresh-789',
          expires_in: 3600
        }), { status: 200 }));
      }

      if (urlStr.endsWith('/workbook/worksheets')) {
        return Promise.resolve(new Response(JSON.stringify({
          value: [{ name: 'Leads' }]
        }), { status: 200 }));
      }
      
      if (urlStr.includes('/workbook/worksheets/Leads/usedRange')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [Object.keys(DEFAULT_COLUMN_MAPPINGS)]
        }), { status: 200 }));
      }

      if (urlStr.includes('/workbook/worksheets/Leads/range(address=\'A2:J2\')')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    });

    const res = await syncCustomerToExcel(TENANT_ID, CUSTOMER_PHONE);
    expect(res.action).toBe('create');
    // Expect DB updates to save the new credentials
    const lastUpdate = dbWrites.updates.find((u: any) => u.table === 'tenant_integrations');
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate.arg.config.access_token).toBe('enc:new-token-456');
  });

  it('MicrosoftExcelWorkerService - claims and processes pending queue jobs', async () => {
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() + 3600000,
            spreadsheet_id: 'workbook-abc',
            sheet_name: 'Leads',
          },
          is_active: true,
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          channel: 'whatsapp',
        },
      },
      'messages:select': { data: null },
      'microsoft_excel_audit_logs:insert': { data: [] },
      'microsoft_excel_sync_queue:delete': { data: [] },
    });

    // Mock claim RPC call returning 1 pending job
    (supabaseAdmin.rpc as any).mockResolvedValueOnce({
      data: [{
        id: 'job-1',
        tenant_id: TENANT_ID,
        lead_id: 'lead-1',
        phone: CUSTOMER_PHONE,
        event_type: 'customer_created',
        attempts: 0,
      }],
      error: null
    });

    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      if (urlStr.endsWith('/workbook/worksheets')) {
        return Promise.resolve(new Response(JSON.stringify({
          value: [{ name: 'Leads' }]
        }), { status: 200 }));
      }
      
      if (urlStr.includes('/workbook/worksheets/Leads/usedRange')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [Object.keys(DEFAULT_COLUMN_MAPPINGS)]
        }), { status: 200 }));
      }

      if (urlStr.includes('/workbook/worksheets/Leads/range(address=\'A2:J2\')')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    });

    const jobsProcessed = await MicrosoftExcelWorkerService.processQueue('test-worker', 10);
    expect(jobsProcessed).toBe(1);
    
    // Check that job was deleted from queue
    const queueDelete = dbWrites.deletes.find((d: any) => d.table === 'microsoft_excel_sync_queue');
    expect(queueDelete).toBeDefined();
  });
});
