// ═══════════════════════════════════════════════════════════
// 🧪 Broadcast COPY_CODE Button & Coupon Parameter Test
// ═══════════════════════════════════════════════════════════
// Ensures templates with COPY_CODE buttons properly extract
// coupon codes and inject the required button parameter component
// into Meta outbound dispatches to prevent (#131008) errors.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { MetaPayloadBuilderService } from '@/lib/broadcast/services/meta-payload-builder.service';
import { TemplateParserService, extractCouponCode } from '@/lib/broadcast/services/template-parser.service';

describe('extractCouponCode', () => {
  it('extracts coupon code from body text containing "Coupon Code: *CODE*"', () => {
    const text = '🔱 *Har Har Mahadev!* 🙏\n\nHello {{1}} Ji,\n\n🎁 *EXTRA 10% OFF*\n🏷️ Coupon Code: *FESTIVE10*\n\n🪷 *7 Mukhi Rudraksha*';
    expect(extractCouponCode(text, '7_mukhi_nepali_festive_offer_festive10', ['SAMPLE123'])).toBe('FESTIVE10');
  });

  it('extracts coupon code from body text containing "Use Code: CODE"', () => {
    const text = 'Special offer! Use Code: SHRAWAN10 for instant discount';
    expect(extractCouponCode(text, 'rudraksha_shrawan', ['SAMPLE123'])).toBe('SHRAWAN10');
  });

  it('extracts coupon code from template name when body text does not have explicit tag', () => {
    const text = 'Get 10% off your purchase today.';
    expect(extractCouponCode(text, '7_mukhi_nepali_festive_offer_festive10', ['SAMPLE123'])).toBe('FESTIVE10');
  });

  it('falls back to example when neither body nor name contains code', () => {
    const text = 'Hello world, click below to copy your code.';
    expect(extractCouponCode(text, 'generic_template_name', ['SAVE20'])).toBe('SAVE20');
  });
});

describe('TemplateParserService with COPY_CODE button', () => {
  it('parses buttons and assigns couponCode for COPY_CODE button', () => {
    const templateJson = {
      name: '7_mukhi_nepali_festive_offer_festive10',
      components: [
        {
          type: 'BODY',
          text: 'Hello {{1}} Ji,\n🎁 *EXTRA 10% OFF*\n🏷️ Coupon Code: *FESTIVE10*',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Visit Website',
              url: 'https://devprayagjal.com/products/7-mukhi-rudraksha',
            },
            {
              type: 'COPY_CODE',
              text: 'Copy offer code',
              example: ['SAMPLE123'],
            },
          ],
        },
      ],
    };

    const parsed = TemplateParserService.parse(templateJson);
    expect(parsed.buttons).toHaveLength(2);
    expect(parsed.buttons[0].type).toBe('URL');
    expect(parsed.buttons[1].type).toBe('COPY_CODE');
    expect(parsed.buttons[1].index).toBe(1);
    expect(parsed.buttons[1].couponCode).toBe('FESTIVE10');
  });
});

describe('MetaPayloadBuilderService with COPY_CODE button', () => {
  it('includes button component with coupon_code parameter for COPY_CODE button', () => {
    const components = MetaPayloadBuilderService.buildPayload(
      { '1': { index: '1', sourceType: 'crm_field', crmField: 'name' } },
      ['1'],
      { id: 'lead-1', name: 'Sandeep', phone: '918010307249' },
      undefined,
      [
        { index: 0, type: 'URL', url: 'https://example.com' },
        { index: 1, type: 'COPY_CODE', couponCode: 'FESTIVE10' },
      ]
    );

    expect(components).toEqual([
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Sandeep' }],
      },
      {
        type: 'button',
        sub_type: 'copy_code',
        index: '1',
        parameters: [
          {
            type: 'coupon_code',
            coupon_code: 'FESTIVE10',
          },
        ],
      },
    ]);
  });

  it('builds payload with both header and copy_code button', () => {
    const components = MetaPayloadBuilderService.buildPayload(
      { '1': { index: '1', sourceType: 'static', staticValue: 'Special Customer' } },
      ['1'],
      { id: 'lead-1', name: 'Sandeep' },
      { type: 'IMAGE', mediaUrl: 'https://example.com/banner.png' },
      [
        { index: 0, type: 'COPY_CODE', couponCode: 'SAVE20' }
      ]
    );

    expect(components).toEqual([
      {
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { link: 'https://example.com/banner.png' }
          }
        ]
      },
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Special Customer' }]
      },
      {
        type: 'button',
        sub_type: 'copy_code',
        index: '0',
        parameters: [
          {
            type: 'coupon_code',
            coupon_code: 'SAVE20'
          }
        ]
      }
    ]);
  });
});
