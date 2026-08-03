import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShopifyClient, normaliseStoreDomain, ShopifyApiError } from '@/lib/shopify/client';

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: new Headers(headers),
  });
}

describe('normaliseStoreDomain', () => {
  it('strips protocol and trailing slash', () => {
    expect(normaliseStoreDomain('https://acme.myshopify.com/')).toBe('acme.myshopify.com');
  });
  it('adds myshopify.com if bare handle', () => {
    expect(normaliseStoreDomain('acme')).toBe('acme.myshopify.com');
  });
  it('leaves already-normalised domain', () => {
    expect(normaliseStoreDomain('acme.myshopify.com')).toBe('acme.myshopify.com');
  });
  it('throws on empty', () => {
    expect(() => normaliseStoreDomain('')).toThrow();
  });
});

describe('ShopifyClient.rest', () => {
  let fetches: Array<{ url: string; init?: RequestInit }>;
  let client: ShopifyClient;

  beforeEach(() => {
    fetches = [];
  });

  it('sends X-Shopify-Access-Token and parses body', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push({ url, init });
      return makeResponse(200, { products: [{ id: 1 }] });
    });
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 'shpat_xyz', apiVersion: '2025-01' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    const res = await client.rest<{ products: Array<{ id: number }> }>('GET', 'products.json');
    expect(res.body.products[0].id).toBe(1);
    expect(fetches[0].url).toContain('/admin/api/2025-01/products.json');
    const headers = fetches[0].init?.headers as Record<string, string>;
    expect(headers['X-Shopify-Access-Token']).toBe('shpat_xyz');
  });

  it('extracts next page_info from Link header', async () => {
    const linkHeader = '<https://acme.myshopify.com/admin/api/2025-01/products.json?page_info=NEXTCURSOR&limit=250>; rel="next"';
    const fetchMock = vi.fn(async () => makeResponse(200, { products: [] }, { link: linkHeader }));
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 't' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    const res = await client.rest('GET', 'products.json');
    expect(res.nextPageInfo).toBe('NEXTCURSOR');
  });

  it('retries once on 429 then succeeds', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return makeResponse(429, { errors: 'rate limited' }, { 'retry-after': '0.01' });
      return makeResponse(200, { ok: true });
    });
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 't' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    const res = await client.rest<{ ok: boolean }>('GET', 'shop.json');
    expect(call).toBe(2);
    expect(res.body.ok).toBe(true);
  });

  it('retries on 5xx then succeeds', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call < 3) return makeResponse(503, 'busy');
      return makeResponse(200, { shop: { id: 1 } });
    });
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 't' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    const res = await client.rest('GET', 'shop.json');
    expect(res.body).toEqual({ shop: { id: 1 } });
    expect(call).toBe(3);
  });

  it('throws ShopifyApiError on 4xx (non-429)', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, { errors: 'Invalid API key' }));
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 't' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    await expect(client.rest('GET', 'shop.json')).rejects.toBeInstanceOf(ShopifyApiError);
  });

  it('applies pageInfo query and drops other filters when paginating', async () => {
    let seen: string = '';
    const fetchMock = vi.fn(async (url: string) => {
      seen = url;
      return makeResponse(200, { products: [] });
    });
    client = new ShopifyClient(
      { storeUrl: 'acme.myshopify.com', accessToken: 't' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    await client.rest('GET', 'products.json', {
      query: { status: 'any', limit: 250 },
      pageInfo: 'CURSOR123',
    });
    expect(seen).toContain('page_info=CURSOR123');
    expect(seen).not.toContain('status=any');
  });
});
