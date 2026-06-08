// ═══════════════════════════════════════════════════════════
// 🛡️ SSRF Guard — validate user-supplied outbound webhook URLs
// ═══════════════════════════════════════════════════════════
// A tenant-controlled `outbound_webhook_url` is passed to fetch().
// Without validation it can be pointed at cloud-metadata endpoints
// (169.254.169.254), loopback, or internal services. This filter
// rejects those before we ever make the request.
//
// NOTE: This validates the URL's literal host only. It does NOT
// defend against DNS-rebinding (a public hostname that resolves to
// a private IP at fetch time). Full protection requires resolving +
// pinning the IP at request time; literal-host filtering covers the
// common, high-signal cases.
// ═══════════════════════════════════════════════════════════

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8 (private)
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 (private)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

/**
 * Returns true only for URLs that are safe to send an outbound webhook to.
 * Requires HTTPS and a public, non-internal host.
 */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Only HTTPS — blocks http:, file:, gopher:, etc.
  if (parsed.protocol !== 'https:') return false;

  // Strip IPv6 brackets for comparison
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  const blockedHosts = new Set([
    'localhost',
    '0.0.0.0',
    '::1',
    '::',
    'metadata.google.internal',
  ]);
  if (blockedHosts.has(host)) return false;

  // Internal TLD suffixes
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return false;
  }

  // Private / loopback / link-local IPv4 literals
  if (isPrivateIPv4(host)) return false;

  // IPv6 loopback / link-local (fe80::) / unique-local (fc00::/7 → fc, fd)
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return false;
  }

  return true;
}
