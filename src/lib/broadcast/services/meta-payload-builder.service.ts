import { VariableConfig } from '@/app/dashboard/broadcast/types';
import { VariableEngineService } from './variable-engine.service';
import { MetaApiError } from '@/lib/meta/service';

export function isInvalidMediaUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return true;
  // Meta's sample handles from template approval contain expiring query tokens (_nc_ and oe=)
  // which expire quickly and cause Meta's outbound downloader to fail with "Media upload error".
  if (trimmed.includes('_nc_') && trimmed.includes('oe=')) {
    return true;
  }
  return false;
}

export class MetaPayloadBuilderService {
  /**
   * Conforms resolved campaign variables into exact Meta template components schema payloads.
   */
  static buildPayload(
    variables: Record<string, VariableConfig>,
    detectedVarIndices: string[],
    lead: any,
    headerConfig?: { type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE'; mediaUrl?: string; text?: string }
  ): any[] {
    const components: any[] = [];

    // 1. Resolve header media/text component if present
    if (headerConfig && headerConfig.type !== 'NONE') {
      const headerParams: any[] = [];
      
      if (headerConfig.type === 'TEXT' && headerConfig.text) {
        headerParams.push({
          type: 'text',
          text: headerConfig.text
        });
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerConfig.type)) {
        if (isInvalidMediaUrl(headerConfig.mediaUrl)) {
          throw new MetaApiError(
            `Template requires a ${headerConfig.type} header, but no valid public HTTPS media URL is configured. ` +
            `Upload a media header image in Template Settings or Campaign Builder before sending.`,
            400,
            { code: 100 }
          );
        }
        const typeLower = headerConfig.type.toLowerCase();
        headerParams.push({
          type: typeLower,
          [typeLower]: {
            link: headerConfig.mediaUrl
          }
        });
      }

      if (headerParams.length > 0) {
        components.push({
          type: 'header',
          parameters: headerParams
        });
      }
    }

    // 2. Resolve body variables component using Variable Engine
    if (detectedVarIndices.length > 0) {
      const bodyParams = detectedVarIndices.map(idx => {
        const cfg = variables[idx];
        const val = cfg ? VariableEngineService.resolveValue(cfg, lead) : '';
        return {
          type: 'text',
          text: val || ' '
        };
      });

      components.push({
        type: 'body',
        parameters: bodyParams
      });
    }

    return components;
  }
}

