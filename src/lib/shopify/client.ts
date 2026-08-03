// ═══════════════════════════════════════════════════════════
// Shopify Admin API client (Custom App auth)
// ═══════════════════════════════════════════════════════════
// Custom-App auth: X-Shopify-Access-Token header, no OAuth.
// Modular: this is the ONLY module that reads credentials from a
// tenant. Everything else takes a ShopifyClient instance, which
// makes an OAuth swap a one-file change.
//
// Rate limits: REST is bucket-based (2 req/sec fill on standard
// plans, 40-token bucket). We retry on 429 with Retry-After, and
// pace additional calls when a response headers a 40/40 leak.
//
// Pagination: REST 2019-07+ uses Link headers with page_info.
// Extract next cursor from `link: <...>; rel="next"`.
// ═══════════════════════════════════════════════════════════

import { decryptTokenV2 } from '@/lib/security/keyManager';

export const DEFAULT_API_VERSION = '2025-01';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

export interface ShopifyCredentials {
  storeUrl: string;              // e.g. 'devprayagjal.myshopify.com' or full https url
  accessToken: string;           // decrypted Admin API access token
  apiVersion?: string;
}

export interface ShopifyClientOptions {
  userAgent?: string;
  fetchImpl?: typeof fetch;      // for tests
}

export interface RestResponse<T> {
  body: T;
  headers: Headers;
  nextPageInfo: string | null;   // extracted from Link header
  callLimit: { used: number; max: number } | null;
}

/** Normalise "https://acme.myshopify.com/", "acme", "acme.myshopify.com" → "acme.myshopify.com". */
export function normaliseStoreDomain(input: string): string {
  const s = (input || '').trim().toLowerCase();
  if (!s) throw new Error('Empty Shopify store URL');
  const noProto = s.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0];
  if (noProto.endsWith('.myshopify.com')) return noProto;
  if (!noProto.includes('.')) return `${noProto}.myshopify.com`;
  return noProto;
}

function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  // Example: <https://x.myshopify.com/admin/api/2025-01/products.json?page_info=abc&limit=250>; rel="next"
  const parts = header.split(',');
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) {
      try {
        const url = new URL(m[1]);
        return url.searchParams.get('page_info');
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseCallLimit(header: string | null): { used: number; max: number } | null {
  if (!header) return null;
  const m = header.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  return { used: parseInt(m[1], 10), max: parseInt(m[2], 10) };
}

export class ShopifyApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly retryable: boolean;
  constructor(status: number, message: string, body: unknown) {
    super(`Shopify ${status}: ${message}`);
    this.status = status;
    this.body = body;
    this.retryable = status === 429 || (status >= 500 && status < 600);
  }
}

export class ShopifyClient {
  public readonly domain: string;
  public readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(creds: ShopifyCredentials, opts: ShopifyClientOptions = {}) {
    this.domain = normaliseStoreDomain(creds.storeUrl);
    this.accessToken = creds.accessToken;
    this.apiVersion = creds.apiVersion || DEFAULT_API_VERSION;
    this.fetchImpl = opts.fetchImpl || fetch;
    this.userAgent = opts.userAgent || 'AriesAI/1.0 (+https://aries.ai)';
    if (!this.accessToken) throw new Error('ShopifyClient: missing accessToken');
  }

  /** Absolute Admin API URL for a path like `products.json`. */
  restUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const clean = path.replace(/^\/+/, '');
    const url = new URL(`https://${this.domain}/admin/api/${this.apiVersion}/${clean}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /** Fetch with 429/5xx retry, Link-header pagination, and call-limit awareness. */
  async rest<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: {
      query?: Record<string, string | number | boolean | undefined>;
      pageInfo?: string;
      body?: unknown;
    } = {}
  ): Promise<RestResponse<T>> {
    const query = { ...(opts.query || {}) };
    if (opts.pageInfo) {
      // When paginating, Shopify requires ONLY page_info + limit — drop filters.
      for (const k of Object.keys(query)) if (k !== 'limit') delete query[k];
      query.page_info = opts.pageInfo;
    }
    const url = this.restUrl(path, query);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': this.userAgent,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

      // 429 → back off with server hint
      if (res.status === 429) {
        if (attempt >= MAX_RETRIES) {
          throw new ShopifyApiError(429, 'Rate limit exceeded (max retries)', await safeJson(res));
        }
        const retryAfter = parseFloat(res.headers.get('retry-after') || '2');
        await sleep(Math.max(retryAfter * 1000, BASE_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      // 5xx → exponential backoff
      if (res.status >= 500 && res.status < 600) {
        if (attempt >= MAX_RETRIES) {
          throw new ShopifyApiError(res.status, `Server error`, await safeJson(res));
        }
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }

      const body = res.status === 204 ? (null as unknown as T) : ((await safeJson(res)) as T);

      if (!res.ok) {
        const errMsg = extractErrorMessage(body) || res.statusText || 'Unknown error';
        throw new ShopifyApiError(res.status, errMsg, body);
      }

      const callLimit = parseCallLimit(res.headers.get('x-shopify-shop-api-call-limit'));
      // Pace if we're 90%+ full to avoid the next request 429ing.
      if (callLimit && callLimit.used / callLimit.max >= 0.9) {
        await sleep(500);
      }

      return {
        body,
        headers: res.headers,
        nextPageInfo: parseLinkHeader(res.headers.get('link')),
        callLimit,
      };
    }
    // Unreachable
    throw new ShopifyApiError(0, 'exhausted retries', null);
  }

  /** GraphQL Admin API. */
  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const url = `https://${this.domain}/admin/api/${this.apiVersion}/graphql.json`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': this.userAgent,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt >= MAX_RETRIES) throw new ShopifyApiError(res.status, 'GraphQL retries exhausted', await safeJson(res));
        const retryAfter = parseFloat(res.headers.get('retry-after') || '0');
        await sleep(Math.max(retryAfter * 1000, BASE_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      const body = await safeJson(res) as { data?: T; errors?: Array<{ message: string }> };
      if (!res.ok || body.errors?.length) {
        throw new ShopifyApiError(res.status, body.errors?.map(e => e.message).join('; ') || 'GraphQL error', body);
      }
      return body.data as T;
    }
    throw new ShopifyApiError(0, 'exhausted retries', null);
  }

  /** Iterate every page of a REST list endpoint. `path` example: 'products.json'. */
  async *paginate<T = unknown>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
    dataKey: string // key inside body that holds the array, e.g. 'products'
  ): AsyncGenerator<T[], void, void> {
    const initialQuery = { limit: 250, ...query };
    let res = await this.rest<Record<string, T[]>>('GET', path, { query: initialQuery });
    let page: T[] = res.body[dataKey] || [];
    yield page;
    while (res.nextPageInfo) {
      res = await this.rest<Record<string, T[]>>('GET', path, {
        query: { limit: initialQuery.limit },
        pageInfo: res.nextPageInfo,
      });
      page = res.body[dataKey] || [];
      if (page.length === 0) break;
      yield page;
    }
  }

  /** Validate credentials + return { name, myshopify_domain, shop_owner, plan, ... }. */
  async getShop(): Promise<Record<string, unknown>> {
    const res = await this.rest<{ shop: Record<string, unknown> }>('GET', 'shop.json');
    return res.body.shop;
  }
}

/**
 * Build a client from a tenant row. The access token is stored encrypted with the
 * versioned key manager; decrypt via decryptTokenV2. Returns null if the tenant
 * has no Shopify credentials configured.
 */
export function shopifyClientForTenant(tenant: {
  shopify_store_url: string | null;
  shopify_access_token: string | null;
  shopify_api_version?: string | null;
}): ShopifyClient | null {
  if (!tenant.shopify_store_url || !tenant.shopify_access_token) return null;
  const token = decryptTokenV2(tenant.shopify_access_token);
  if (!token) return null;
  return new ShopifyClient({
    storeUrl: tenant.shopify_store_url,
    accessToken: token,
    apiVersion: tenant.shopify_api_version || DEFAULT_API_VERSION,
  });
}

// ─── helpers ────────────────────────────────────────────────
async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.errors === 'string') return b.errors;
  if (b.errors && typeof b.errors === 'object') {
    try { return JSON.stringify(b.errors); } catch { return null; }
  }
  if (typeof b.error === 'string') return b.error;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
