// Centralized Variable Registry + Resolver for the automation engine.
// Every automation template placeholder maps to exactly one registry entry.
// The resolver produces a fully-typed Record<string, string> from raw DB data
// so no caller ever constructs variables by hand.

import type { Tenant } from '@/lib/types';
import { greetingName, greetingFirstName, NEUTRAL_GREETING } from '@/lib/utils/contact-name';

// ═══════════════════════════════════════
// VARIABLE REGISTRY
// ═══════════════════════════════════════

export interface VariableEntry {
  name: string;
  label: string;
  description: string;
  required: boolean;
  defaultFallback: string | null;
  category: 'customer' | 'booking' | 'restaurant' | 'lead';
}

export const VARIABLE_REGISTRY: VariableEntry[] = [
  // ── Customer ──
  { name: 'customer_name',  label: 'Customer Name',  description: 'Full name of the customer',             required: true,  defaultFallback: NEUTRAL_GREETING, category: 'customer' },
  { name: 'first_name',     label: 'First Name',     description: 'First name only',                       required: false, defaultFallback: NEUTRAL_GREETING, category: 'customer' },
  { name: 'customer_phone', label: 'Customer Phone',  description: 'Phone number with country code',       required: false, defaultFallback: null,           category: 'customer' },
  { name: 'customer_email', label: 'Customer Email',  description: 'Email address if collected',            required: false, defaultFallback: null,           category: 'customer' },

  // ── Booking ──
  { name: 'booking_date',    label: 'Booking Date',    description: 'Formatted date (e.g. Sat, 28 Jun 2026)',  required: true,  defaultFallback: null,  category: 'booking' },
  { name: 'booking_time',    label: 'Booking Time',    description: 'Formatted time (e.g. 8:00 PM)',           required: true,  defaultFallback: null,  category: 'booking' },
  { name: 'date',            label: 'Date (alias)',     description: 'Alias for booking_date',                  required: false, defaultFallback: null,  category: 'booking' },
  { name: 'time',            label: 'Time (alias)',     description: 'Alias for booking_time',                  required: false, defaultFallback: null,  category: 'booking' },
  { name: 'guest_count',     label: 'Guest Count',     description: 'e.g. "4 guests"',                         required: true,  defaultFallback: null,  category: 'booking' },
  { name: 'party_size',      label: 'Party Size',      description: 'Numeric guest count as string',           required: false, defaultFallback: null,  category: 'booking' },
  { name: 'reservation_id',  label: 'Reservation ID',  description: 'e.g. RES-20260628-1234',                  required: true,  defaultFallback: null,  category: 'booking' },
  { name: 'table',           label: 'Table',           description: 'Assigned table name or empty',             required: false, defaultFallback: '',    category: 'booking' },
  { name: 'table_number',    label: 'Table Number',    description: 'Alias for table',                          required: false, defaultFallback: '',    category: 'booking' },
  { name: 'special_requests', label: 'Special Requests', description: 'Customer notes/requests',               required: false, defaultFallback: '',    category: 'booking' },

  // ── Restaurant / Business ──
  { name: 'business_name',    label: 'Business Name',    description: 'Restaurant or business name',           required: true,  defaultFallback: 'us',             category: 'restaurant' },
  { name: 'restaurant_name',  label: 'Restaurant Name',  description: 'Alias for business_name',               required: false, defaultFallback: null,             category: 'restaurant' },
  { name: 'business_phone',   label: 'Business Phone',   description: 'Restaurant phone number',               required: false, defaultFallback: null,             category: 'restaurant' },
  { name: 'business_address', label: 'Business Address',  description: 'Restaurant address',                   required: false, defaultFallback: null,             category: 'restaurant' },
  { name: 'instagram',        label: 'Instagram',        description: 'Instagram profile URL',                  required: false, defaultFallback: null,             category: 'restaurant' },
  { name: 'google_review_url', label: 'Google Review URL', description: 'Google review link',                   required: false, defaultFallback: null,             category: 'restaurant' },

  // ── Lead ──
  { name: 'lead_source',  label: 'Lead Source',  description: 'How the lead was acquired',   required: false, defaultFallback: 'whatsapp', category: 'lead' },
  { name: 'lead_status',  label: 'Lead Status',  description: 'Current lead status',         required: false, defaultFallback: 'new',      category: 'lead' },
];

// Fast lookup by variable name
export const REGISTRY_MAP = new Map(VARIABLE_REGISTRY.map(v => [v.name, v]));
export const KNOWN_VARIABLE_NAMES = new Set(VARIABLE_REGISTRY.map(v => v.name));

// Sample data for live preview in the template editor
export const SAMPLE_VARIABLES: Record<string, string> = {
  customer_name:    'Himanshu Gupta',
  first_name:       'Himanshu',
  customer_phone:   '+91 98281 86029',
  customer_email:   'himanshu@example.com',
  booking_date:     'Sat, 28 Jun 2026',
  booking_time:     '8:00 PM',
  date:             'Sat, 28 Jun 2026',
  time:             '8:00 PM',
  guest_count:      '4 guests',
  party_size:       '4',
  reservation_id:   'RES-20260628-1234',
  table:            'Table A3',
  table_number:     'A3',
  special_requests: 'Window seat preferred',
  business_name:    'NEO Lounge',
  restaurant_name:  'NEO Lounge',
  business_phone:   '+91 141 123 4567',
  business_address: '123 MI Road, Jaipur',
  instagram:        'https://instagram.com/neojaipur',
  google_review_url: 'https://g.page/r/neo-lounge',
  lead_source:      'whatsapp',
  lead_status:      'new',
};

// ═══════════════════════════════════════
// TEMPLATE VALIDATION
// ═══════════════════════════════════════

export interface TemplateValidationResult {
  valid: boolean;
  unknownVariables: string[];
  suggestions: Record<string, string>;
}

export function validateTemplate(templateText: string): TemplateValidationResult {
  const used = new Set<string>();
  const unknownVariables: string[] = [];
  const suggestions: Record<string, string> = {};

  templateText.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    used.add(key);
    if (!KNOWN_VARIABLE_NAMES.has(key)) {
      unknownVariables.push(key);
      const suggestion = findClosestVariable(key);
      if (suggestion) suggestions[key] = suggestion;
    }
    return '';
  });

  return {
    valid: unknownVariables.length === 0,
    unknownVariables,
    suggestions,
  };
}

function findClosestVariable(input: string): string | null {
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const name of KNOWN_VARIABLE_NAMES) {
    const d = levenshtein(lower, name);
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ═══════════════════════════════════════
// VARIABLE RESOLVER
// ═══════════════════════════════════════

export interface BookingContext {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  guestCount: number;
  bookingDate: string;       // raw YYYY-MM-DD
  slotTime: string;          // raw HH:MM:SS
  reservationId: string;
  tableName?: string | null;
  specialRequests?: string | null;
}

export function resolveBookingVariables(
  booking: BookingContext,
  tenant: Tenant | Record<string, any>,
): Record<string, string> {
  const prettyDate = formatDate(booking.bookingDate);
  const prettyTime = formatTime(booking.slotTime);
  const guestLabel = `${booking.guestCount} guest${booking.guestCount !== 1 ? 's' : ''}`;

  return {
    // Customer
    customer_name:    greetingName(booking.customerName),
    first_name:       greetingFirstName(booking.customerName),
    customer_phone:   booking.customerPhone || '',
    customer_email:   booking.customerEmail || '',

    // Booking (formatted)
    booking_date:     prettyDate,
    booking_time:     prettyTime,
    date:             prettyDate,
    time:             prettyTime,
    guest_count:      guestLabel,
    party_size:       String(booking.guestCount || ''),
    reservation_id:   booking.reservationId || '',
    table:            booking.tableName ? `Table ${booking.tableName}` : '',
    table_number:     booking.tableName || '',
    special_requests: booking.specialRequests ? String(booking.specialRequests) : '',

    // Restaurant
    business_name:    tenant.business_name || '',
    restaurant_name:  tenant.business_name || '',
    business_phone:   tenant.business_phone || '',
    business_address: tenant.business_address || '',
    instagram:        '',
    google_review_url: (tenant as any).google_review_url || '',

    // Lead
    lead_source:      'whatsapp',
    lead_status:      'new',
  };
}

// ═══════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════

export function formatDate(rawDate: string): string {
  if (!rawDate) return '';
  const d = new Date(`${rawDate}T00:00:00`);
  if (isNaN(d.getTime())) return rawDate;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatTime(rawTime: string): string {
  if (!rawTime) return '';
  const [h, m] = rawTime.split(':');
  const hr = parseInt(h, 10);
  if (isNaN(hr)) return rawTime.slice(0, 5);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const hr12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${hr12}:${m} ${ampm}`;
}
