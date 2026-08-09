// ═══════════════════════════════════════════════════════════
// Shiprocket API client (email+password login → Bearer JWT)
// ═══════════════════════════════════════════════════════════
// No OAuth: POST /v1/external/auth/login with {email,password} returns a
// JWT that Shiprocket's docs describe as valid for ~10 days; every other
// call sends it as `Authorization: Bearer <token>`. Token issuance/refresh
// lives in service.ts (getValidShiprocketToken) — this class only takes an
// already-valid token, mirroring ShopifyClient's "credentials in, HTTP out"
// shape so it stays testable via an injected fetchImpl.
//
// Every request/response shape below is reconstructed from the public docs
// at https://apidocs.shiprocket.in/ — there is no live account to verify
// against yet. Anything marked [UNVERIFIED] should be the first thing
// checked against a real account before this integration reaches merchants.
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://apiv2.shiprocket.in';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

export interface ShiprocketCredentials {
  token: string; // already-decrypted JWT
}

export interface ShiprocketClientOptions {
  fetchImpl?: typeof fetch; // for tests
  userAgent?: string;
}

export class ShiprocketApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly retryable: boolean;
  constructor(status: number, message: string, body: unknown) {
    super(`Shiprocket ${status}: ${message}`);
    this.status = status;
    this.body = body;
    this.retryable = status === 429 || (status >= 500 && status < 600);
  }
}

// ─── request/response shapes [UNVERIFIED against live account] ──────────

export interface PickupLocation {
  pickup_location: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  phone: string;
}

export interface CreateOrderLineItem {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
}

export interface CreateOrderInput {
  order_id: string; // our idempotency-visible order reference (Shopify order number)
  order_date: string; // 'YYYY-MM-DD HH:mm'
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email?: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: CreateOrderLineItem[];
  payment_method: 'Prepaid' | 'COD';
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number; // kg
}

export interface CreateOrderResult {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  awb_code?: string;
}

export interface ServiceabilityInput {
  pickup_postcode: string;
  delivery_postcode: string;
  weight: number; // kg
  cod: boolean;
}

export interface CourierOption {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd?: string;
  cod: number;
}

export interface AssignAwbResult {
  awb_code: string;
  courier_company_id: number;
  courier_name: string;
}

export interface GeneratePickupResult {
  pickup_scheduled_date: string;
  pickup_token_number: string;
  status: number;
}

export interface TrackingActivity {
  date: string;
  status: string;
  activity: string;
  location: string;
}

export interface TrackingResult {
  awb_code: string;
  current_status: string;
  shipment_track_activities: TrackingActivity[];
}

export interface CancelResult {
  status: number;
  message: string;
}

export class ShiprocketClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(creds: ShiprocketCredentials, opts: ShiprocketClientOptions = {}) {
    if (!creds.token) throw new Error('ShiprocketClient: missing token');
    this.token = creds.token;
    this.fetchImpl = opts.fetchImpl || fetch;
    this.userAgent = opts.userAgent || 'AriesAI/1.0 (+https://aries.ai)';
  }

  /** POST /v1/external/auth/login — no token needed yet, so this is static. */
  static async login(email: string, password: string, fetchImpl: typeof fetch = fetch): Promise<{ token: string }> {
    const res = await fetchImpl(`${BASE_URL}/v1/external/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await safeJson(res)) as { token?: string; message?: string } | null;
    if (!res.ok || !body?.token) {
      throw new ShiprocketApiError(res.status, body?.message || res.statusText || 'Login failed', body);
    }
    return { token: body.token };
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {}
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.fetchImpl(url.toString(), {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': this.userAgent,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

      if (res.status === 429) {
        if (attempt >= MAX_RETRIES) throw new ShiprocketApiError(429, 'Rate limit exceeded (max retries)', await safeJson(res));
        const retryAfter = parseFloat(res.headers.get('retry-after') || '2');
        await sleep(Math.max(retryAfter * 1000, BASE_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      if (res.status >= 500 && res.status < 600) {
        if (attempt >= MAX_RETRIES) throw new ShiprocketApiError(res.status, 'Server error', await safeJson(res));
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }

      const body = res.status === 204 ? (null as unknown as T) : ((await safeJson(res)) as T);

      if (!res.ok) {
        const errMsg = extractErrorMessage(body) || res.statusText || 'Unknown error';
        throw new ShiprocketApiError(res.status, errMsg, body);
      }

      return body;
    }
    // Unreachable
    throw new ShiprocketApiError(0, 'exhausted retries', null);
  }

  /** GET /v1/external/settings/company/pickup — [UNVERIFIED exact response shape]. */
  async listPickupLocations(): Promise<PickupLocation[]> {
    const res = await this.request<{ data?: { shipping_address?: PickupLocation[] } }>('GET', '/v1/external/settings/company/pickup');
    return res?.data?.shipping_address || [];
  }

  /** POST /v1/external/orders/create/adhoc */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    return this.request<CreateOrderResult>('POST', '/v1/external/orders/create/adhoc', { body: input });
  }

  /** GET /v1/external/courier/serviceability/ — [UNVERIFIED response envelope]. */
  async courierServiceability(input: ServiceabilityInput): Promise<CourierOption[]> {
    const res = await this.request<{ data?: { available_courier_companies?: CourierOption[] } }>(
      'GET',
      '/v1/external/courier/serviceability/',
      { query: { pickup_postcode: input.pickup_postcode, delivery_postcode: input.delivery_postcode, weight: input.weight, cod: input.cod ? 1 : 0 } }
    );
    return res?.data?.available_courier_companies || [];
  }

  /** POST /v1/external/courier/assign/awb */
  async assignAwb(shipmentId: number, courierId?: number): Promise<AssignAwbResult> {
    const res = await this.request<{ response?: { data?: AssignAwbResult } }>('POST', '/v1/external/courier/assign/awb', {
      body: courierId ? { shipment_id: shipmentId, courier_id: courierId } : { shipment_id: shipmentId },
    });
    if (!res?.response?.data) throw new ShiprocketApiError(0, 'AWB assignment returned no data', res);
    return res.response.data;
  }

  /** POST /v1/external/courier/generate/pickup */
  async generatePickup(shipmentIds: number[]): Promise<GeneratePickupResult> {
    const res = await this.request<{ pickup_status?: number; response?: { pickup_scheduled_date: string; pickup_token_number: string } }>(
      'POST',
      '/v1/external/courier/generate/pickup',
      { body: { shipment_id: shipmentIds } }
    );
    if (!res?.response) throw new ShiprocketApiError(0, 'Pickup generation returned no data', res);
    return { ...res.response, status: res.pickup_status ?? 0 };
  }

  /** POST /v1/external/courier/generate/label */
  async generateLabel(shipmentIds: number[]): Promise<{ label_url: string }> {
    const res = await this.request<{ label_url?: string; label_created?: number }>('POST', '/v1/external/courier/generate/label', {
      body: { shipment_id: shipmentIds },
    });
    if (!res?.label_url) throw new ShiprocketApiError(0, 'Label generation returned no URL', res);
    return { label_url: res.label_url };
  }

  /** GET /v1/external/courier/track/awb/{awb} */
  async trackByAwb(awbCode: string): Promise<TrackingResult> {
    const res = await this.request<{ tracking_data?: TrackingResult }>('GET', `/v1/external/courier/track/awb/${encodeURIComponent(awbCode)}`);
    if (!res?.tracking_data) throw new ShiprocketApiError(0, 'Tracking returned no data', res);
    return res.tracking_data;
  }

  /** POST /v1/external/orders/cancel — implemented, not wired to any route/UI in the MVP pass. */
  async cancelOrder(orderIds: number[]): Promise<CancelResult> {
    return this.request<CancelResult>('POST', '/v1/external/orders/cancel', { body: { ids: orderIds } });
  }
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
  if (typeof b.message === 'string') return b.message;
  if (typeof b.errors === 'string') return b.errors;
  if (b.errors && typeof b.errors === 'object') {
    try { return JSON.stringify(b.errors); } catch { return null; }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
