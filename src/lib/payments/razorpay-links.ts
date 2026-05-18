// ═══════════════════════════════════════════════════════════
// Razorpay Payment Link Generator
// ═══════════════════════════════════════════════════════════
// Creates a short Razorpay payment link scoped to a tenant.
// Keys are read from env — tenants use the platform account.
// ═══════════════════════════════════════════════════════════

export interface PaymentLinkOptions {
  amount: number;       // in INR (whole rupees — converted to paise internally)
  description?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  expiryHours?: number; // default 24
}

export async function createPaymentLink(opts: PaymentLinkOptions): Promise<string | null> {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.warn('createPaymentLink: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set');
    return null;
  }

  const auth    = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const expiry  = Math.floor(Date.now() / 1000) + (opts.expiryHours ?? 24) * 3600;

  const body: Record<string, unknown> = {
    amount:           opts.amount * 100,  // paise
    currency:         'INR',
    description:      opts.description ?? 'Payment',
    expire_by:        expiry,
    reminder_enable:  false,
  };

  if (opts.customerName || opts.customerPhone || opts.customerEmail) {
    body.customer = {
      name:    opts.customerName    ?? undefined,
      contact: opts.customerPhone   ?? undefined,
      email:   opts.customerEmail   ?? undefined,
    };
  }

  try {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('createPaymentLink: Razorpay error', res.status, errText);
      return null;
    }

    const data = await res.json() as { short_url?: string; id?: string };
    return data.short_url ?? (data.id ? `https://rzp.io/i/${data.id}` : null);
  } catch (e) {
    console.error('createPaymentLink: fetch failed', (e as Error).message);
    return null;
  }
}
