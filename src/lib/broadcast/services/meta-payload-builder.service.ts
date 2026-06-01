import { VariableConfig } from '@/app/dashboard/broadcast/types';
import { VariableEngineService } from './variable-engine.service';

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
      } else if (headerConfig.mediaUrl) {
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
