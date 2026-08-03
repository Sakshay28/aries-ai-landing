// Shared helpers for the Shopify sync/webhook code paths.

/** Strip HTML tags/entities down to plain text for search/AI use. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Coerce anything nullable/mixed to a finite number or null. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Format a Shopify order name — accept string ("#1001") or number and normalise. */
export function orderNumberOf(o: { name?: string; order_number?: number | string; number?: number | string }): string | null {
  if (o.name) return String(o.name);
  const n = o.order_number ?? o.number;
  return n == null ? null : `#${n}`;
}

/** Build the AI-friendly search blob for a product. */
export function buildProductSearchText(p: {
  title?: string;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string | null;
  body_text?: string | null;
  handle?: string | null;
}): string {
  const tags = Array.isArray(p.tags)
    ? p.tags.join(' ')
    : typeof p.tags === 'string' ? p.tags : '';
  return [p.title, p.vendor, p.product_type, tags, p.handle, p.body_text]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .slice(0, 4000);
}

/** Split an array into fixed-size chunks. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
