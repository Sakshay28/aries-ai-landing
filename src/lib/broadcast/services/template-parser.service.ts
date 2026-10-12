import { Template } from '@/app/dashboard/broadcast/types';

export interface ParsedButton {
  index: number;
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP' | 'FLOW' | string;
  text?: string;
  url?: string;
  phoneNumber?: string;
  couponCode?: string;
  example?: any;
}

export interface ParsedComponents {
  headerType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE';
  headerText?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons: ParsedButton[];
  detectedVariables: string[];
}

/**
 * Extracts promo / coupon code from body text, template name, or button example.
 */
export function extractCouponCode(
  bodyText?: string,
  templateName?: string,
  buttonExample?: any
): string {
  // 1. Check body text for explicit coupon / promo patterns
  if (bodyText) {
    const codeMatch = bodyText.match(
      /(?:coupon\s*code|promo\s*code|offer\s*code|discount\s*code|use\s*code|code)\s*[:：\-–]?\s*\*?([A-Za-z0-9_-]{3,30})\*?/i
    );
    if (codeMatch && codeMatch[1]) {
      const candidate = codeMatch[1].trim().replace(/^\*+|\*+$/g, '');
      const lower = candidate.toLowerCase();
      if (!['http', 'https', 'terms', 'conditions', 'apply', 'here', 'now', 'link'].includes(lower)) {
        return candidate;
      }
    }
  }

  // 2. Check template name suffix (e.g. 7_mukhi_nepali_festive_offer_festive10 -> FESTIVE10)
  if (templateName) {
    const couponMatch = templateName.match(/(?:coupon|promo|code|offer)_*([a-zA-Z0-9]+)$/i) ||
                        templateName.match(/(?:couponcode|promocode|offercode)([a-zA-Z0-9]+)$/i);
    if (couponMatch && couponMatch[1]) {
      return couponMatch[1].toUpperCase();
    }
    const parts = templateName.split('_');
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p && /^(?:[a-zA-Z]+\d+|\d+[a-zA-Z]+)$/i.test(p)) {
        return p.toUpperCase();
      }
    }
  }

  // 3. Fallback to button example from Meta template definition
  if (buttonExample) {
    const ex = Array.isArray(buttonExample) ? buttonExample[0] : buttonExample;
    if (typeof ex === 'string' && ex.trim()) {
      return ex.trim();
    }
  }

  return '';
}

export class TemplateParserService {
  /**
   * Parses the raw template JSON object cached in the database into normalized layout components.
   */
  static parse(templateJson: any): ParsedComponents {
    const rawComponents = templateJson?.components || [];
    
    const bodyComp = rawComponents.find((c: any) => c.type === 'BODY');
    const headerComp = rawComponents.find((c: any) => c.type === 'HEADER');
    const footerComp = rawComponents.find((c: any) => c.type === 'FOOTER');
    const buttonsComp = rawComponents.find((c: any) => c.type === 'BUTTONS');

    // 1. Resolve header properties
    let headerType: ParsedComponents['headerType'] = 'NONE';
    let headerText: string | undefined;
    let headerMediaUrl: string | undefined;

    if (headerComp) {
      headerType = (headerComp.format || 'TEXT') as ParsedComponents['headerType'];
      headerText = headerComp.text || undefined;
      const customUrl = templateJson?.header_media_url || templateJson?.customHeaderMediaUrl || templateJson?.headerMediaUrl;
      headerMediaUrl = (customUrl && !customUrl.includes('_nc_'))
        ? customUrl
        : (headerComp.example?.header_handle?.[0] || undefined);
    }

    // 2. Resolve body & variables
    const bodyText = bodyComp?.text || templateJson?.body || '';
    const matches = [...bodyText.matchAll(/{{(\d+)}}/g)];
    const detectedVariables = [...new Set(matches.map(m => m[1]))].sort((a, b) => Number(a) - Number(b));

    // 3. Resolve buttons
    const parsedButtons: ParsedButton[] = [];
    const buttonsList = buttonsComp?.buttons || templateJson?.buttons || [];
    if (Array.isArray(buttonsList)) {
      buttonsList.forEach((b: any, index: number) => {
        const bType = String(b.type || '').toUpperCase();
        const bExample = b.example || (Array.isArray(b.examples) ? b.examples[0] : undefined);
        let couponCode: string | undefined;

        if (bType === 'COPY_CODE') {
          couponCode = b.coupon_code || b.couponCode || extractCouponCode(bodyText, templateJson?.name, bExample);
        }

        parsedButtons.push({
          index,
          type: bType,
          text: b.text || '',
          url: b.url || undefined,
          phoneNumber: b.phone_number || b.phoneNumber || undefined,
          couponCode,
          example: bExample,
        });
      });
    }

    return {
      headerType,
      headerText,
      headerMediaUrl,
      body: bodyText,
      footer: footerComp?.text || templateJson?.footer || undefined,
      buttons: parsedButtons,
      detectedVariables
    };
  }

  /**
   * Substitutes bracket index variables `{{1}}`, `{{2}}` inside text body with mapped values.
   */
  static interpolate(text: string, values: Record<string, string>): string {
    if (!text) return '';
    return text.replace(/{{(\d+)}}/g, (match, key) => {
      return values[key] !== undefined ? values[key] : match;
    });
  }
}
