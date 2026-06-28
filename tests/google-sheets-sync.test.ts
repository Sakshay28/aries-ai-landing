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
import { syncCustomerToSheet, DEFAULT_COLUMN_MAPPINGS } from '@/lib/integrations/google-sheets';
import { GoogleSheetsWorkerService } from '@/lib/integrations/google-sheets-worker';

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

describe('Google Sheets Real-time Synchronization CRM Mirror', () => {
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

  it('syncCustomerToSheet - appends new customer if phone number is not found', async () => {
    // Mock database records
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() + 3600000,
            spreadsheet_id: 'sheet-abc',
            sheet_name: 'CRM Mirror',
            column_mappings: {},
          },
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          tenant_id: TENANT_ID,
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          email: 'sakshay@example.com',
          channel: 'whatsapp',
          lead_status: 'new',
          lead_score: 30,
          created_at: '2026-06-27T12:00:00Z',
          updated_at: '2026-06-27T12:00:00Z',
        },
      },
      'conversations:select': { data: null },
      'restaurant_bookings:select': { data: [] },
      'shopify_events:select': { data: [] },
      'broadcast_deliveries:select': { data: null },
      'google_sheets_audit_logs:insert': { data: [] },
    });

    // Mock Google API fetch requests
    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      // 1. Sheet metadata (checking if sheet exists)
      if (urlStr.includes('/spreadsheets/sheet-abc?fields=sheets.properties.title')) {
        return Promise.resolve(new Response(JSON.stringify({
          sheets: [{ properties: { title: 'CRM Mirror' } }]
        }), { status: 200 }));
      }
      
      // 2. Fetch sheet headers (GET A1:ZZ1)
      if (urlStr.includes('/values/CRM Mirror!A1:ZZ1')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [Object.keys(DEFAULT_COLUMN_MAPPINGS)]
        }), { status: 200 }));
      }

      // 3. Fetch phone number column values to check for duplicates (GET B:B, phone maps to col B)
      if (urlStr.includes('/values/CRM Mirror!B:B')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [['WhatsApp Number'], ['+919999999999']] // different phone number
        }), { status: 200 }));
      }

      // 4. Append row values
      if (urlStr.includes(':append')) {
        return Promise.resolve(new Response(JSON.stringify({
          updates: { updatedRange: 'CRM Mirror!A3:AZ3', updatedRows: 1 }
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 400 }));
    });

    const result = await syncCustomerToSheet(TENANT_ID, CUSTOMER_PHONE);
    
    expect(result.action).toBe('create');
    
    // Check that append API was called
    const appendCall = fetchSpy.mock.calls.find(call => String(call[0]).includes(':append'));
    expect(appendCall).toBeDefined();
    
    const body = JSON.parse(appendCall![1]!.body as string);
    // Row values should contain our customer data mapped
    expect(body.values[0][0]).toBe('Sakshay Gupta'); // Customer Name
    expect(body.values[0][1]).toBe(CUSTOMER_PHONE); // Phone Number
  });

  it('syncCustomerToSheet - updates existing row if phone number is found (deduplication)', async () => {
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            refresh_token: 'enc:refresh-123',
            expires_at: Date.now() + 3600000,
            spreadsheet_id: 'sheet-abc',
            sheet_name: 'CRM Mirror',
          },
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          tenant_id: TENANT_ID,
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          email: 'sakshay@example.com',
          channel: 'whatsapp',
          lead_status: 'warm',
          lead_score: 50,
          created_at: '2026-06-27T12:00:00Z',
          updated_at: '2026-06-27T12:05:00Z',
        },
      },
      'conversations:select': { data: null },
      'restaurant_bookings:select': { data: [] },
      'shopify_events:select': { data: [] },
      'broadcast_deliveries:select': { data: null },
    });

    fetchSpy.mockImplementation((url) => {
      const urlStr = decodeURIComponent(String(url));
      
      if (urlStr.includes('/spreadsheets/sheet-abc?fields=sheets.properties.title')) {
        return Promise.resolve(new Response(JSON.stringify({
          sheets: [{ properties: { title: 'CRM Mirror' } }]
        }), { status: 200 }));
      }
      
      if (urlStr.includes('/values/CRM Mirror!A1:ZZ1')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [Object.keys(DEFAULT_COLUMN_MAPPINGS)]
        }), { status: 200 }));
      }

      // Customer phone exists at row index 2 (row 3 in spreadsheet)
      if (urlStr.includes('/values/CRM Mirror!B:B')) {
        return Promise.resolve(new Response(JSON.stringify({
          values: [['WhatsApp Number'], ['+919999999999'], [CUSTOMER_PHONE]]
        }), { status: 200 }));
      }

      // Update PUT request
      if (urlStr.includes('/values/CRM Mirror!A3:')) {
        return Promise.resolve(new Response(JSON.stringify({
          updatedRange: 'CRM Mirror!A3:AZ3'
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 400 }));
    });

    const result = await syncCustomerToSheet(TENANT_ID, CUSTOMER_PHONE);
    
    expect(result.action).toBe('update');
    
    // Check that PUT API was called on row 3
    const putCall = fetchSpy.mock.calls.find(call => {
      const urlStr = decodeURIComponent(String(call[0]));
      return urlStr.includes('/values/CRM Mirror!A3:') && call[1]?.method === 'PUT';
    });
    expect(putCall).toBeDefined();
    
    const body = JSON.parse(putCall![1]!.body as string);
    expect(body.values[0][0]).toBe('Sakshay Gupta');
    expect(body.values[0][3]).toBe('warm'); // Current Status
  });

  it('GoogleSheetsWorkerService - claims and processes pending queue jobs', async () => {
    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            spreadsheet_id: 'sheet-abc',
            expires_at: Date.now() + 3600000,
          },
        },
      },
      'leads:select': {
        data: {
          id: 'lead-1',
          name: 'Sakshay Gupta',
          phone: CUSTOMER_PHONE,
          lead_status: 'new',
        },
      },
      'conversations:select': { data: null },
      'restaurant_bookings:select': { data: [] },
      'shopify_events:select': { data: [] },
      'broadcast_deliveries:select': { data: null },
      'google_sheets_audit_logs:insert': { data: [] },
      'google_sheets_sync_queue:delete': { data: [] },
    });

    // Mock RPC claims
    const rpcSpy = vi.spyOn(supabaseAdmin, 'rpc').mockResolvedValue({
      data: [{
        id: 'job-1',
        tenant_id: TENANT_ID,
        lead_id: 'lead-1',
        phone: CUSTOMER_PHONE,
        event_type: 'customer_created',
        payload: {},
        attempts: 0,
      }],
      error: null,
    } as any);

    fetchSpy.mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/spreadsheets/sheet-abc?fields=sheets.properties.title')) {
        return Promise.resolve(new Response(JSON.stringify({ sheets: [{ properties: { title: 'Leads' } }] }), { status: 200 }));
      }
      if (urlStr.includes('/values/Leads!A1:ZZ1')) {
        return Promise.resolve(new Response(JSON.stringify({ values: [Object.keys(DEFAULT_COLUMN_MAPPINGS)] }), { status: 200 }));
      }
      if (urlStr.includes('/values/Leads!B:B')) {
        return Promise.resolve(new Response(JSON.stringify({ values: [['WhatsApp Number']] }), { status: 200 }));
      }
      if (urlStr.includes(':append')) {
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 400 }));
    });

    const processed = await GoogleSheetsWorkerService.processQueue('worker-test', 1);
    
    expect(processed).toBe(1);
    expect(rpcSpy).toHaveBeenCalledWith('claim_google_sheets_sync_jobs', {
      p_worker_id: 'worker-test',
      p_limit: 1,
    });

    // Verify queue job was deleted (marked completed)
    const delCall = dbWrites.deletes.find((d: any) => d.table === 'google_sheets_sync_queue');
    expect(delCall).toBeDefined();

    // Verify audit log success was written
    const auditCall = dbWrites.inserts.find((i: any) => i.table === 'google_sheets_audit_logs');
    expect(auditCall).toBeDefined();
    expect(auditCall.arg.status).toBe('success');
  });

  it('GoogleSheetsWorkerService - applies exponential backoff on failure', async () => {
    // Mocks queue claims
    vi.spyOn(supabaseAdmin, 'rpc').mockResolvedValue({
      data: [{
        id: 'job-err',
        tenant_id: TENANT_ID,
        lead_id: 'lead-1',
        phone: CUSTOMER_PHONE,
        event_type: 'customer_updated',
        payload: {},
        attempts: 1,
      }],
      error: null,
    } as any);

    dbWrites = setupMockDb({
      'tenant_integrations:select': {
        data: {
          config: {
            access_token: 'enc:token-123',
            spreadsheet_id: 'sheet-abc',
          },
        },
      },
      // Lead retrieval fails to trigger a sync failure
      'leads:select': { data: null, error: { message: 'DB Failure' } },
      'google_sheets_sync_queue:update': { data: [] },
      'google_sheets_audit_logs:insert': { data: [] },
    });

    const processed = await GoogleSheetsWorkerService.processQueue('worker-test', 1);
    
    expect(processed).toBe(1);

    // Verify job was rescheduled as pending with updated attempt count
    const updateCall = dbWrites.updates.find((u: any) => u.table === 'google_sheets_sync_queue');
    expect(updateCall).toBeDefined();
    expect(updateCall.arg.status).toBe('pending');
    expect(updateCall.arg.attempts).toBe(2);
    expect(updateCall.arg.run_at).toBeDefined();
    
    // Check that audit log recorded the retry failure
    const auditCall = dbWrites.inserts.find((i: any) => i.table === 'google_sheets_audit_logs');
    expect(auditCall).toBeDefined();
    expect(auditCall.arg.status).toBe('failed');
    expect(auditCall.arg.details.fatal).toBe(false);
  });
});
