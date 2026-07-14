import { VariableConfig } from '@/app/dashboard/broadcast/types';
import { greetingName, greetingFirstName } from '@/lib/utils/contact-name';

interface LeadRecord {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  [key: string]: any;
}

export class VariableEngineService {
  /**
   * Resolves a key placeholder mapping into a single clean string value for a specific contact CRM lead.
   */
  static resolveValue(cfg: VariableConfig, lead: LeadRecord): string {
    if (!cfg) return '';
    
    if (cfg.sourceType === 'static' || cfg.sourceType === 'custom') {
      return cfg.staticValue || '';
    }

    if (cfg.sourceType === 'crm_field' && cfg.crmField) {
      const field = cfg.crmField.toLowerCase();
      // Match common fields
      // Sanitize the stored name so emoji/symbol profile names never reach the
      // outbound message; the shared helper falls back to the neutral "there"
      // greeting when there is no usable name.
      if (field === 'first name' || field === 'firstname') {
        return greetingFirstName(lead.name);
      }
      if (field === 'name') {
        return greetingName(lead.name);
      }
      if (field === 'phone' || field === 'mobile') {
        return lead.phone || '';
      }
      if (field === 'email') {
        return lead.email || '';
      }
      if (field === 'notes') {
        return lead.notes || '';
      }
      // Fallback direct key match
      return String(lead[cfg.crmField] || lead[field] || '');
    }

    return '';
  }

  /**
   * Resolves all index variables for a lead into a Record of strings.
   */
  static resolveAll(variables: Record<string, VariableConfig>, lead: LeadRecord): Record<string, string> {
    const resolved: Record<string, string> = {};
    Object.entries(variables).forEach(([key, cfg]) => {
      resolved[key] = this.resolveValue(cfg, lead);
    });
    return resolved;
  }

  /**
   * Validates if all detected variables have valid source mappings.
   */
  static validate(variables: Record<string, VariableConfig>, detectedVarIndices: string[]): boolean {
    return detectedVarIndices.every(idx => {
      const cfg = variables[idx];
      if (!cfg) return false;
      if (cfg.sourceType === 'static' || cfg.sourceType === 'custom') {
        return !!cfg.staticValue?.trim();
      }
      if (cfg.sourceType === 'crm_field') {
        return !!cfg.crmField;
      }
      return false;
    });
  }

  /**
   * Builds the Meta Graph API template components parameter array.
   */
  static buildMetaPayload(
    variables: Record<string, VariableConfig>, 
    detectedVarIndices: string[], 
    lead: LeadRecord
  ): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
    if (detectedVarIndices.length === 0) return [];

    const parameters = detectedVarIndices.map(idx => {
      const cfg = variables[idx];
      const val = cfg ? this.resolveValue(cfg, lead) : '';
      return {
        type: 'text',
        text: val || ' '
      };
    });

    return [
      {
        type: 'body',
        parameters
      }
    ];
  }
}
