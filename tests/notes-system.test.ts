/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock getCurrentUser ──
vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
  canManageTeam: vi.fn(() => true),
}));

// ── Mock supabaseAdmin ──
vi.mock('@/lib/supabase/admin', () => {
  const mockFrom = vi.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

// ── Mock logAudit ──
vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { GET, POST, PATCH, DELETE } from '@/app/api/dashboard/notes/route';

describe('Notes API System Units & Integrations', () => {
  const MOCK_USER = {
    id: 'u-123',
    tenant_id: 't-100',
    email: 'agent@aries.ai',
    full_name: 'Agent Cooper',
    role: 'staff',
    is_sales_agent: true,
    is_platform_admin: false,
  };

  const MOCK_CONVO_ID = 'c9096236-47b2-4d2c-8cb3-1b9195b28d0f';
  const MOCK_CONTACT_ID = 'e20a0628-97c7-43cf-bf2f-04a081bc13e1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unauthenticated GET requests return 401 Unauthorized', async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/dashboard/notes?conversationId=${MOCK_CONVO_ID}`);
    const res = await GET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('GET requests return notes formatted correctly', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    const dbNotes = [
      {
        id: 'n-1',
        text: 'First note',
        created_at: '2026-07-01T12:00:00Z',
        created_by: 'u-123',
        created_by_name: 'Agent Cooper',
      },
      {
        id: 'n-2',
        text: 'Second note',
        created_at: '2026-07-01T13:00:00Z',
        created_by: 'u-123',
        created_by_name: 'Agent Cooper',
      },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: dbNotes, error: null }),
    };
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const req = new NextRequest(`http://localhost/api/dashboard/notes?conversationId=${MOCK_CONVO_ID}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.notes).toHaveLength(2);
    expect(data.notes[0]).toEqual({
      id: 'n-1',
      text: 'First note',
      createdAt: '2026-07-01T12:00:00Z',
      createdBy: 'Agent Cooper',
    });
  });

  it('POST creation rejects empty or whitespace-only notes', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    const testPayloads = [
      { conversationId: MOCK_CONVO_ID, contactId: MOCK_CONTACT_ID, text: '' },
      { conversationId: MOCK_CONVO_ID, contactId: MOCK_CONTACT_ID, text: '   ' },
      { conversationId: MOCK_CONVO_ID, contactId: MOCK_CONTACT_ID, text: '\n\n' },
    ];

    for (const payload of testPayloads) {
      const req = new NextRequest('http://localhost/api/dashboard/notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    }
  });

  it('POST note inserts database row and returns 201 Created', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    // Mock ownership checks
    const convoChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: MOCK_CONVO_ID }, error: null }),
    };
    const contactChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: MOCK_CONTACT_ID }, error: null }),
    };

    const insertNote = {
      id: 'note-uuid-1',
      text: 'This is a premium note content',
      created_at: '2026-07-01T22:00:00Z',
      created_by: MOCK_USER.id,
      created_by_name: 'Agent Cooper',
    };

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: insertNote, error: null }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'conversations') return convoChain;
      if (table === 'leads') return contactChain;
      return insertChain;
    });

    const payload = {
      conversationId: MOCK_CONVO_ID,
      contactId: MOCK_CONTACT_ID,
      text: 'This is a premium note content',
      idempotencyKey: 'idem-key-1',
    };

    const req = new NextRequest('http://localhost/api/dashboard/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('note-uuid-1');
    expect(data.text).toBe(payload.text);
    expect(data.createdBy).toBe('Agent Cooper');
  });

  it('POST handles idempotency key conflicts by returning existing note with 200 OK', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    // Mock ownership checks
    const convoChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: MOCK_CONVO_ID }, error: null }),
    };
    const contactChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: MOCK_CONTACT_ID }, error: null }),
    };

    // First insert triggers unique constraint error
    const err = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: err }),
    };

    // Secondary fetch retrieves existing note
    const existingNote = {
      id: 'existing-note-uuid',
      text: 'Original note text',
      created_at: '2026-07-01T21:00:00Z',
      created_by: MOCK_USER.id,
      created_by_name: 'Agent Cooper',
    };
    const fetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existingNote, error: null }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'conversations') return convoChain;
      if (table === 'leads') return contactChain;
      // When inserting, return the insert chain which errors. When fetching, return fetchChain
      if (supabaseAdmin.from.name === 'from') {
        // We can inspect active mocking or count mock calls
        // To be safe, return fetchChain if mock calls on insert have already happened
        // Let's implement simple check
      }
      return insertChain;
    });

    // Let's adjust mocks specifically for this test
    let isInsert = true;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'conversations') return convoChain;
      if (table === 'leads') return contactChain;
      if (table === 'notes') {
        if (isInsert) {
          isInsert = false;
          return insertChain;
        }
        return fetchChain;
      }
    });

    const payload = {
      conversationId: MOCK_CONVO_ID,
      contactId: MOCK_CONTACT_ID,
      text: 'Original note text',
      idempotencyKey: 'idem-key-1',
    };

    const req = new NextRequest('http://localhost/api/dashboard/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('existing-note-uuid');
    expect(data.text).toBe('Original note text');
    expect(data.createdBy).toBe('Agent Cooper');
  });

  it('PATCH requests validate note ownership and update note text', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    const validUuid = 'a10a0628-97c7-43cf-bf2f-04a081bc13e3';
    const existingNote = { id: validUuid, text: 'Old text', tenant_id: MOCK_USER.tenant_id };
    const updatedNote = { id: validUuid, text: 'New text', created_at: '2026-07-01T22:00:00Z', created_by_name: 'Agent Cooper' };

    const notesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existingNote, error: null }),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedNote, error: null }),
    };

    (supabaseAdmin.from as any).mockReturnValue(notesChain);

    const req = new NextRequest('http://localhost/api/dashboard/notes', {
      method: 'PATCH',
      body: JSON.stringify({ id: validUuid, text: 'New text' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.note.text).toBe('New text');
  });

  it('DELETE requests validate ownership and remove note row', async () => {
    (getCurrentUser as any).mockResolvedValue(MOCK_USER);

    const validUuid = 'a10a0628-97c7-43cf-bf2f-04a081bc13e3';
    const existingNote = { id: validUuid, text: 'Old text', tenant_id: MOCK_USER.tenant_id };

    const notesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existingNote, error: null }),
      delete: vi.fn().mockReturnThis(),
    };

    // Mock resolution of delete chain promise (which is thenable or resolves directly)
    const deleteChain = {
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => cb({ error: null })),
    };
    (notesChain.delete as any).mockReturnValue(deleteChain);

    (supabaseAdmin.from as any).mockReturnValue(notesChain);

    const req = new NextRequest(`http://localhost/api/dashboard/notes?id=${validUuid}`, {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
