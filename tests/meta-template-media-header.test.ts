import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildMetaComponents,
  createMetaTemplate,
  uploadMediaToMetaResumable,
} from '@/lib/meta/templates';

describe('Meta Template Image Header Processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buildMetaComponents includes example.header_handle with the provided media URL', () => {
    const components = buildMetaComponents({
      headerType: 'IMAGE',
      headerMediaUrl: 'https://example.com/storage/v1/object/public/template-media/test.jpg',
      body: 'Hello {{1}}, festival blessings from Devprayagjal!',
      variableMap: { 'Customer Name': 1 },
      category: 'MARKETING',
      buttons: [],
    }) as any[];

    const header = components.find((c) => c.type === 'HEADER');
    expect(header).toBeDefined();
    expect(header.format).toBe('IMAGE');
    expect(header.example).toBeDefined();
    expect(header.example.header_handle).toEqual([
      'https://example.com/storage/v1/object/public/template-media/test.jpg',
    ]);
  });

  it('buildMetaComponents includes HEADER component even if media URL is missing so validators catch it', () => {
    const components = buildMetaComponents({
      headerType: 'IMAGE',
      body: 'Welcome!',
      variableMap: {},
      category: 'MARKETING',
      buttons: [],
    }) as any[];

    const header = components.find((c) => c.type === 'HEADER');
    expect(header).toBeDefined();
    expect(header.format).toBe('IMAGE');
    expect(header.example).toBeUndefined();
  });

  it('createMetaTemplate converts HTTP media URLs into Meta Resumable Upload handles before posting to Meta', async () => {
    const mockFetch = vi.fn(async (url: string | URL, opts?: any) => {
      const urlStr = url.toString();

      // 1. Download image from storage URL
      if (urlStr === 'https://example.com/banner.jpg') {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }

      // 2. Discover App ID
      if (urlStr.includes('/app?access_token=')) {
        return new Response(JSON.stringify({ id: 'mock_app_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 3. Resumable Upload Session
      if (urlStr.includes('/mock_app_123/uploads')) {
        return new Response(JSON.stringify({ id: 'upload:session_xyz' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 4. Binary chunk upload
      if (urlStr.includes('/upload:session_xyz')) {
        return new Response(JSON.stringify({ h: '4::mock_resumable_handle_abc123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 5. Template submission to Meta
      if (urlStr.includes('/waba_999/message_templates')) {
        const body = JSON.parse(opts.body);
        const header = body.components.find((c: any) => c.type === 'HEADER');
        // CRITICAL CHECK: Header handle MUST be the Meta upload handle, NOT the HTTP URL!
        expect(header.example.header_handle[0]).toBe('4::mock_resumable_handle_abc123');

        return new Response(JSON.stringify({ id: 'meta_template_456', status: 'PENDING' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await createMetaTemplate('fake_token_1234567890123456', 'waba_999', {
      name: 'devprayagjal_festive_offer',
      category: 'MARKETING',
      language: 'en',
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: {
            header_handle: ['https://example.com/banner.jpg'],
          },
        },
        {
          type: 'BODY',
          text: 'Exclusive offer from Devprayagjal.',
        },
      ],
    });

    expect(result.id).toBe('meta_template_456');
    expect(result.status).toBe('PENDING');
  });

  it('createMetaTemplate rejects media headers without sample before hitting Meta', async () => {
    await expect(
      createMetaTemplate('fake_token', 'waba_999', {
        name: 'no_media_sample',
        category: 'MARKETING',
        language: 'en',
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
          },
          {
            type: 'BODY',
            text: 'Test body',
          },
        ],
      })
    ).rejects.toThrow(/sample image file is required/i);
  });
});
