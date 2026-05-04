// ═══════════════════════════════════════════════════════════
// 🌗 Brand Configuration — Aries AI ↔ Libra AI
// ═══════════════════════════════════════════════════════════
// Single source of truth for brand-specific copy, colors, and
// channel mappings. Read by:
//   - proxy.ts (host detection → x-brand header)
//   - landing pages (theme, hero, features)
//   - dashboard (channel filter, plan filter)
//   - signup/onboard (default brand attribution)
// ═══════════════════════════════════════════════════════════

import { headers } from 'next/headers';

export type Brand = 'aries' | 'libra';

export interface BrandConfig {
  id: Brand;
  name: string;            // "Aries AI"
  domain: string;          // "ariesai.in"
  channel: 'whatsapp' | 'instagram';
  primaryColor: string;
  primaryDark: string;
  logoUrl: string;
  tagline: string;
  supportEmail: string;
}

export const BRANDS: Record<Brand, BrandConfig> = {
  aries: {
    id: 'aries',
    name: 'Aries AI',
    domain: 'ariesai.in',
    channel: 'whatsapp',
    primaryColor: '#25D366',  // WhatsApp green
    primaryDark: '#128C7E',
    logoUrl: '/logo.png',
    tagline: 'AI-Powered WhatsApp Automation for Indian Businesses',
    supportEmail: 'support@ariesai.in',
  },
  libra: {
    id: 'libra',
    name: 'Libra AI',
    domain: 'libraai.in',
    channel: 'instagram',
    primaryColor: '#E1306C',  // Instagram pink
    primaryDark: '#833AB4',
    logoUrl: '/libra-logo.png',
    tagline: 'AI-Powered Instagram DM Automation for Creators & Brands',
    supportEmail: 'support@libraai.in',
  },
};

/**
 * Detect brand from a request hostname. Used by proxy.ts and
 * server components. Falls back to 'aries' for unknown hosts.
 */
export function detectBrandFromHost(host: string | null | undefined): Brand {
  if (!host) return 'aries';
  const h = host.toLowerCase();
  if (h.includes('libra')) return 'libra';
  return 'aries';
}

/**
 * Read the current brand inside a Server Component / route handler.
 * The brand is set as `x-brand` header by `proxy.ts`.
 */
export async function getCurrentBrand(): Promise<BrandConfig> {
  try {
    const h = await headers();
    const brand = (h.get('x-brand') as Brand) || detectBrandFromHost(h.get('host'));
    return BRANDS[brand] || BRANDS.aries;
  } catch {
    return BRANDS.aries;
  }
}
