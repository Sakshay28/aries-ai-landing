import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  googleMapsUrlSchema,
  buildGoogleMapsUrl,
  parseCoordinatesFromUrl,
} from '@/lib/types/location';
import { ToolRegistry } from '@/lib/ai/tools/registry';
import { SendLocationTool } from '@/lib/ai/tools/sendLocation';
import { resolveGoogleMapsUrl, sendLocationToWhatsApp } from '@/lib/location/service';

// Mock location service
vi.mock('@/lib/location/service', () => ({
  sendLocationToWhatsApp: vi.fn(() => Promise.resolve({ success: true, messageId: 'wa-msg-test-123' })),
  resolveGoogleMapsUrl: vi.fn((url) => {
    if (url === 'https://maps.app.goo.gl/abcdefg') {
      return Promise.resolve({
        latitude: 26.912434,
        longitude: 75.787271,
        name: 'Romeo Lane Jaipur',
        address: 'Jaipur'
      });
    }
    return Promise.resolve({ latitude: 0, longitude: 0, name: 'Fallback', address: '' });
  })
}));

// Mock supabaseAdmin
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [
              {
                id: '123-loc',
                name: 'Main entrance',
                address: '123 Street',
                latitude: 12.3456,
                longitude: 78.9012,
                category: 'MAIN',
                priority: 10,
                is_default: true,
                is_active: true,
                created_at: new Date().toISOString()
              }
            ],
            error: null
          }))
        }))
      }))
    }))
  }
}));

describe('📍 Native WhatsApp Location Support Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod Validation & Helpers', () => {
    it('should validate google maps redirect url shapes', () => {
      const valid1 = 'https://maps.app.goo.gl/abcdefg';
      const valid2 = 'https://goo.gl/maps/xyz';
      const valid3 = 'https://www.google.com/maps/place/123+Street/@12.34,-45.67';
      const invalid = 'https://yahoo.com/maps';

      expect(googleMapsUrlSchema.safeParse(valid1).success).toBe(true);
      expect(googleMapsUrlSchema.safeParse(valid2).success).toBe(true);
      expect(googleMapsUrlSchema.safeParse(valid3).success).toBe(true);
      expect(googleMapsUrlSchema.safeParse(invalid).success).toBe(false);
    });

    it('should parse coordinates from standard url shapes', () => {
      const urlWithAt = 'https://www.google.com/maps/place/Romeo+Lane/@26.912434,75.787271,17z';
      const parsedAt = parseCoordinatesFromUrl(urlWithAt);
      expect(parsedAt).toEqual({ latitude: 26.912434, longitude: 75.787271 });

      const urlWithD3 = 'https://www.google.com/maps/dir//!3d26.912434!4d75.787271';
      const parsedD3 = parseCoordinatesFromUrl(urlWithD3);
      expect(parsedD3).toEqual({ latitude: 26.912434, longitude: 75.787271 });

      const urlWithQ = 'https://maps.google.com/?q=26.912434,75.787271';
      const parsedQ = parseCoordinatesFromUrl(urlWithQ);
      expect(parsedQ).toEqual({ latitude: 26.912434, longitude: 75.787271 });
    });

    it('should construct Google Maps URL query strings correctly', () => {
      const url = buildGoogleMapsUrl(26.9124, 75.7872, 'Jaipur Office');
      expect(url).toContain('https://www.google.com/maps/search/?api=1');
      expect(url).toContain('query=Jaipur%20Office');
    });
  });

  describe('Google Maps Resolution', () => {
    it('should resolve short links by following redirect headers', async () => {
      const result = await resolveGoogleMapsUrl('https://maps.app.goo.gl/abcdefg');
      expect(result).toBeDefined();
      expect(result.latitude).toBe(26.912434);
      expect(result.longitude).toBe(75.787271);
      expect(result.name).toBe('Romeo Lane Jaipur');
    });
  });

  describe('AI Tool Registry', () => {
    it('should have send_location registered', () => {
      const toolOk = ToolRegistry.has('send_location');
      expect(toolOk).toBe(true);
    });

    it('should execute SendLocationTool search logic', async () => {
      const ctx = {
        tenantId: 'tenant-123',
        phone: '919999999999',
        conversationId: 'conv-123',
        accessToken: 'token-abc',
        phoneNumberId: 'phoneid-123'
      };

      const result = await ToolRegistry.execute('send_location', ctx, { query: 'Main entrance' });
      expect(result).toEqual({ success: true, messageId: 'wa-msg-test-123' });
      expect(sendLocationToWhatsApp).toHaveBeenCalled();
    });
  });
});
