// ═══════════════════════════════════════════════════════════
// 📍 Location Types & Validation Schemas
// ═══════════════════════════════════════════════════════════
// Shared types for the WhatsApp native location message feature.
// Used by: location service, flow engine, live chat, AI engine,
// API routes, and settings UI.
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Saved Location (DB row) ──
export interface SavedLocation {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  google_maps_url: string | null;
  place_id: string | null;
  category: string;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Location categories for the dropdown ──
export const LOCATION_CATEGORIES = [
  'general',
  'restaurant',
  'hotel',
  'parking',
  'valet',
  'pickup_point',
  'banquet',
  'reception',
  'office',
  'warehouse',
  'kitchen',
  'vip_entrance',
  'delivery',
  'event_venue',
] as const;

export type LocationCategory = (typeof LOCATION_CATEGORIES)[number];

// ── Location payload for sending ──
export interface LocationPayload {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

// ── Location message metadata (stored in messages.metadata) ──
export interface LocationMessageMeta {
  interactive_type: 'location';
  latitude: number;
  longitude: number;
  location_name: string;
  location_address: string;
  saved_location_id?: string;
  google_maps_url?: string;
}

// ── Zod Schemas ──

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const locationPayloadSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  longitude: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  name: z.string().min(1, 'Location name is required').max(500),
  address: z.string().min(1, 'Address is required').max(1000),
});

export const savedLocationCreateSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(500),
  address: z.string().min(1, 'Address is required').max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  google_maps_url: z.string().url().optional().nullable(),
  place_id: z.string().optional().nullable(),
  category: z.string().default('general'),
  priority: z.number().optional().default(0),
  is_default: z.boolean().optional().default(false),
});

export const savedLocationUpdateSchema = savedLocationCreateSchema.partial();

export const sendLocationByIdSchema = z.object({
  phone: z.string().min(7).max(20),
  locationId: z.string().uuid(),
});

export const sendLocationInlineSchema = z.object({
  phone: z.string().min(7).max(20),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().min(1).max(500),
  address: z.string().min(1).max(1000),
});

export const googleMapsUrlSchema = z.string().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes('google.com') ||
        parsed.hostname.includes('goo.gl') ||
        parsed.hostname.includes('maps.app.goo.gl')
      );
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid Google Maps URL' }
);

// ── Helper: build Google Maps URL from coordinates ──
export function buildGoogleMapsUrl(lat: number, lng: number, name?: string): string {
  const q = name ? encodeURIComponent(name) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=`;
}

// ── Helper: parse coordinates from a Google Maps URL (best-effort) ──
export function parseCoordinatesFromUrl(url: string): { latitude: number; longitude: number } | null {
  try {
    // Match patterns like @26.912434,75.787271 or !3d26.912434!4d75.787271
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
    }
    const d3d4Match = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (d3d4Match) {
      return { latitude: parseFloat(d3d4Match[1]), longitude: parseFloat(d3d4Match[2]) };
    }
    // Match q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
      return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
    }
    return null;
  } catch {
    return null;
  }
}
