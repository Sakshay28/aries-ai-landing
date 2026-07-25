// ═══════════════════════════════════════════════════════════
// 🧪 Broadcast Media-Header Regression — 2026-07-25
// ═══════════════════════════════════════════════════════════
// Every template with an IMAGE/VIDEO/DOCUMENT header must carry a
// `header` component with the media link on EVERY send — Meta does not
// reuse the approval-time example. broadcast-engine.service.ts parsed this
// out of the cached template JSON but never passed it into
// MetaPayloadBuilderService.buildPayload(), so image-header campaigns sent
// with no header component at all and Meta rejected every message
// (observed live: campaign bfe321f6 for Lazy Mozo Banquet, error 132012).
// Run: npx vitest run tests/broadcast-header-media.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { MetaPayloadBuilderService } from '@/lib/broadcast/services/meta-payload-builder.service';
import { TemplateParserService } from '@/lib/broadcast/services/template-parser.service';

describe('MetaPayloadBuilderService — header component', () => {
  it('includes a header component with the media link for an IMAGE header template with no body variables', () => {
    const components = MetaPayloadBuilderService.buildPayload(
      {},
      [],
      { id: 'lead-1', name: null, phone: '919875152290' },
      { type: 'IMAGE', mediaUrl: 'https://scontent.whatsapp.net/example.jpg' }
    );

    expect(components).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'image', image: { link: 'https://scontent.whatsapp.net/example.jpg' } }],
      },
    ]);
  });

  it('omits the header component entirely when headerConfig is not supplied (documents the prior bug)', () => {
    const components = MetaPayloadBuilderService.buildPayload(
      {},
      [],
      { id: 'lead-1', name: null, phone: '919875152290' }
    );

    expect(components).toEqual([]);
  });

  it('sends both header and body components when a template has an image header AND body variables', () => {
    const components = MetaPayloadBuilderService.buildPayload(
      { '1': { index: '1', sourceType: 'crm_field', crmField: 'name' } },
      ['1'],
      { id: 'lead-1', name: 'Priya', phone: '919875152290' },
      { type: 'IMAGE', mediaUrl: 'https://scontent.whatsapp.net/example.jpg' }
    );

    expect(components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://scontent.whatsapp.net/example.jpg' } }],
    });
    expect(components[1].type).toBe('body');
  });
});

describe('TemplateParserService — header extraction', () => {
  it('parses headerType and headerMediaUrl from a Meta template with an IMAGE header and zero body variables', () => {
    const templateJson = {
      components: [
        { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['https://scontent.whatsapp.net/example.jpg'] } },
        { type: 'BODY', text: 'Celebrate every occasion in style!' },
      ],
    };

    const parsed = TemplateParserService.parse(templateJson);

    expect(parsed.headerType).toBe('IMAGE');
    expect(parsed.headerMediaUrl).toBe('https://scontent.whatsapp.net/example.jpg');
    expect(parsed.detectedVariables).toEqual([]);
  });
});
