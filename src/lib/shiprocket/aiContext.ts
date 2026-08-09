// ═══════════════════════════════════════════════════════════
// Shiprocket AI context builder
// ═══════════════════════════════════════════════════════════
// Runs BEFORE Gemini, same slot as src/lib/shopify/aiContext.ts. Uses its
// own small intent-keyword regex rather than importing Shopify's (which
// isn't exported anyway) — keeps the two integrations decoupled.

import { getShipmentTracking, type ShipmentTracking } from './ai';

export type ShiprocketAIContext = ShipmentTracking;

interface BuildInput {
  tenantId: string;
  message: string;
  lead: { phone?: string | null; email?: string | null } | null;
}

const TRACKING_KEYWORDS = /(track|tracking|shipment|shipped|courier|awb|delivery|delivered|dispatch|parcel|kaha.*order|order.*kaha|kab.*mile)/i;
const ORDER_NUMBER_RE = /#?\b(\d{3,10})\b/;

export async function getShiprocketContext(input: BuildInput): Promise<ShiprocketAIContext | null> {
  const { tenantId, message, lead } = input;
  if (!TRACKING_KEYWORDS.test(message)) return null;

  const numMatch = message.match(ORDER_NUMBER_RE);
  const order_number = numMatch ? numMatch[1] : undefined;

  const tracking = await getShipmentTracking(tenantId, {
    order_number,
    phone: lead?.phone || undefined,
    email: lead?.email || undefined,
  }).catch(() => null);

  // No Shiprocket shipment for this order — the Shopify context (if
  // connected) still covers generic fulfillment-status info, so return null
  // rather than adding an empty block.
  return tracking;
}

export function renderShiprocketContextForPrompt(ctx: ShiprocketAIContext): string {
  const lines: string[] = [
    "SHIPROCKET SHIPMENT CONTEXT (authoritative, live shipment status for this customer's order — use these facts, do NOT invent tracking info):",
  ];
  if (ctx.order_number) lines.push(`- Order: ${ctx.order_number}`);
  lines.push(`- Shipment status: ${ctx.status}`);
  if (ctx.courier_name) lines.push(`- Courier: ${ctx.courier_name}`);
  if (ctx.awb_code) lines.push(`- AWB: ${ctx.awb_code}`);
  if (ctx.tracking_url) lines.push(`- Tracking URL: ${ctx.tracking_url}`);
  if (ctx.last_event) {
    const loc = ctx.last_event.location ? ` at ${ctx.last_event.location}` : '';
    const time = ctx.last_event.event_time ? ` (${ctx.last_event.event_time})` : '';
    lines.push(`- Last update: ${ctx.last_event.status || ctx.status}${loc}${time}`);
  }
  lines.push("Answer tracking/delivery questions using these facts only. If a field is missing, say so — do NOT guess.");
  return lines.join('\n');
}
