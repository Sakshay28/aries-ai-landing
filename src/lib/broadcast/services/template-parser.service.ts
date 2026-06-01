import { Template } from '@/app/dashboard/broadcast/types';

interface ParsedComponents {
  headerType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE';
  headerText?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
  detectedVariables: string[];
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
      headerMediaUrl = headerComp.example?.header_handle?.[0] || undefined;
    }

    // 2. Resolve body & variables
    const bodyText = bodyComp?.text || '';
    const matches = [...bodyText.matchAll(/{{(\d+)}}/g)];
    const detectedVariables = [...new Set(matches.map(m => m[1]))].sort((a, b) => Number(a) - Number(b));

    // 3. Resolve buttons
    const parsedButtons: ParsedComponents['buttons'] = [];
    if (buttonsComp?.buttons) {
      buttonsComp.buttons.forEach((b: any) => {
        parsedButtons.push({
          type: b.type as any,
          text: b.text,
          url: b.url || undefined,
          phoneNumber: b.phone_number || undefined,
        });
      });
    }

    return {
      headerType,
      headerText,
      headerMediaUrl,
      body: bodyText,
      footer: footerComp?.text || undefined,
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
