import { describe, it, expect, vi } from 'vitest';
import { ShiprocketClient, ShiprocketApiError } from '@/lib/shiprocket/client';

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: new Headers(headers),
  });
}

describe('ShiprocketClient.login', () => {
  it('returns a token on success', async () => {
    const fetchMock = vi.fn(async () => makeResponse(200, { token: 'jwt-abc' }));
    const { token } = await ShiprocketClient.login('a@b.com', 'pw', fetchMock as unknown as typeof fetch);
    expect(token).toBe('jwt-abc');
  });

  it('throws ShiprocketApiError on invalid credentials', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, { message: 'Invalid email or password' }));
    await expect(ShiprocketClient.login('a@b.com', 'wrong', fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(ShiprocketApiError);
  });

  it('throws when the response has no token even on 200', async () => {
    const fetchMock = vi.fn(async () => makeResponse(200, { message: 'unexpected shape' }));
    await expect(ShiprocketClient.login('a@b.com', 'pw', fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(ShiprocketApiError);
  });
});

describe('ShiprocketClient requests', () => {
  it('sends Authorization: Bearer <token> and parses body', async () => {
    const fetches: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push({ url, init });
      return makeResponse(200, { order_id: 1, shipment_id: 2, status: 'NEW', status_code: 1 });
    });
    const client = new ShiprocketClient({ token: 'jwt-abc' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const result = await client.createOrder({
      order_id: '#1001', order_date: '2026-08-10 12:00', pickup_location: 'Main',
      billing_customer_name: 'Test', billing_address: 'Addr', billing_city: 'City',
      billing_pincode: '110001', billing_state: 'State', billing_country: 'India',
      billing_phone: '9999999999', shipping_is_billing: true, order_items: [],
      payment_method: 'Prepaid', sub_total: 100, length: 10, breadth: 10, height: 10, weight: 0.5,
    });
    expect(result.order_id).toBe(1);
    expect(fetches[0].url).toContain('/v1/external/orders/create/adhoc');
    const headers = fetches[0].init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
  });

  it('retries once on 429 then succeeds', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return makeResponse(429, { message: 'rate limited' }, { 'retry-after': '0.01' });
      return makeResponse(200, { data: { shipping_address: [] } });
    });
    const client = new ShiprocketClient({ token: 't' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await client.listPickupLocations();
    expect(call).toBe(2);
    expect(res).toEqual([]);
  });

  it('retries on 5xx then succeeds', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call < 3) return makeResponse(503, 'busy');
      return makeResponse(200, { data: { shipping_address: [{ pickup_location: 'Main' }] } });
    });
    const client = new ShiprocketClient({ token: 't' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await client.listPickupLocations();
    expect(call).toBe(3);
    expect(res).toHaveLength(1);
  });

  it('throws ShiprocketApiError on 4xx (non-429) and marks it non-retryable', async () => {
    const fetchMock = vi.fn(async () => makeResponse(422, { message: 'Validation failed' }));
    const client = new ShiprocketClient({ token: 't' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(client.trackByAwb('AWB123')).rejects.toMatchObject({ status: 422, retryable: false });
  });

  it('marks 429 and 5xx as retryable on ShiprocketApiError', () => {
    expect(new ShiprocketApiError(429, 'rate limited', null).retryable).toBe(true);
    expect(new ShiprocketApiError(503, 'busy', null).retryable).toBe(true);
    expect(new ShiprocketApiError(400, 'bad request', null).retryable).toBe(false);
  });
});
