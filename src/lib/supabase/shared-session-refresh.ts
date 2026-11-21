// ═══════════════════════════════════════════════════════════════════════════
// Share Supabase session refreshes between requests on the same server.
//
// Nothing on the server saves a refreshed session back into the browser's
// cookies: the root middleware.ts never runs (the app lives in src/),
// getCurrentUser/getTenantId/the dashboard layout can't write cookies, and the
// login routes set the session cookies httpOnly so the browser-side client can't
// refresh them either. So once a session's access token is an hour old, EVERY
// dashboard API call asks Supabase Auth to refresh it, all from Vercel's IPs.
// An open inbox polls several endpoints, so a few agents trip Supabase Auth's
// token-refresh limits. On 2026-11-21 20:37–20:42 IST every dashboard API
// returned 401 ("Too many concurrent token refresh requests on the same
// session", then "Request rate limit reached") and Adventure Island's inbox
// showed "Couldn't load conversations".
//
// This fixes it without touching cookies: requests presenting the same refresh
// token share one refresh call while it's in flight, and reuse its successful
// result until shortly before the new access token expires. Supabase Auth
// itself hands back the same session when a client re-presents a refresh token
// whose result it couldn't store, so the only thing skipped is the round trip.
// getUser() still verifies the access token with Supabase on every request, so
// a signed-out or revoked session is still rejected.
// ═══════════════════════════════════════════════════════════════════════════

type StoredRefresh = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  reuseUntil: number;
};

const SAFETY_MARGIN_MS = 5 * 60_000; // stop reusing 5 min before the access token expires
const FALLBACK_REUSE_MS = 10 * 60_000; // if the response has no expires_in
const MAX_STORED = 2_000;

const inFlight = new Map<string, Promise<StoredRefresh>>();
const stored = new Map<string, StoredRefresh>();

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isRefreshCall(url: string, init?: RequestInit): init is RequestInit & { body: string } {
  return (
    (init?.method ?? 'GET').toUpperCase() === 'POST' &&
    url.includes('/auth/v1/token') &&
    url.includes('grant_type=refresh_token') &&
    typeof init?.body === 'string'
  );
}

function reuseWindowMs(body: string): number {
  try {
    const seconds = Number(JSON.parse(body)?.expires_in);
    if (Number.isFinite(seconds) && seconds > 0) return Math.max(0, seconds * 1000 - SAFETY_MARGIN_MS);
  } catch {
    // not JSON: fall through
  }
  return FALLBACK_REUSE_MS;
}

function toResponse(r: StoredRefresh): Response {
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
}

function prune(now: number): void {
  for (const [key, value] of stored) {
    if (value.reuseUntil <= now) stored.delete(key);
  }
  while (stored.size > MAX_STORED) {
    const oldest = stored.keys().next().value;
    if (oldest === undefined) break;
    stored.delete(oldest);
  }
}

async function send(input: RequestInfo | URL, init: RequestInit): Promise<StoredRefresh> {
  const res = await fetch(input, init);
  const body = await res.text();
  // The body is already decoded; drop headers that describe the wire encoding.
  const headers = [...res.headers.entries()].filter(
    ([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase()),
  );
  return {
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
    reuseUntil: res.ok ? Date.now() + reuseWindowMs(body) : 0,
  };
}

/** Pass as `global.fetch` to every server-side Supabase auth client. */
export const sharedRefreshFetch: typeof fetch = async (input, init) => {
  const url = urlOf(input);
  if (!isRefreshCall(url, init)) return fetch(input, init);

  const key = `${url}\n${init.body}`;
  const now = Date.now();
  const hit = stored.get(key);
  if (hit && hit.reuseUntil > now) return toResponse(hit);

  let pending = inFlight.get(key);
  if (!pending) {
    // Settle the bookkeeping before any waiter resumes, so a failed refresh is
    // never handed to a request that arrives right after it.
    pending = send(input, init).then(
      (r) => {
        inFlight.delete(key);
        if (r.reuseUntil > Date.now()) {
          stored.set(key, r);
          prune(Date.now());
        }
        return r;
      },
      (err) => {
        inFlight.delete(key);
        throw err;
      },
    );
    inFlight.set(key, pending);
  }
  return toResponse(await pending);
};

/** Test hook. */
export function resetSharedRefreshCache(): void {
  inFlight.clear();
  stored.clear();
}
