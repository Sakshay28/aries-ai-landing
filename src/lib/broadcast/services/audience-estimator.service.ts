import { AudienceState } from '@/app/dashboard/broadcast/types';
import { AudienceEngineService } from './audience-engine.service';

export interface EstimateResult {
  total: number;
  eligibleRecipients: number;
  duplicatesRemoved: number;
  optOutsRemoved: number;
  invalidRemoved: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class AudienceEstimatorService {
  /**
   * Estimates target audience size and compliance health statistics dynamically from CRM.
   */
  static async estimateAudience(tenantId: string, audience: AudienceState): Promise<EstimateResult> {
    const resolved = await AudienceEngineService.resolveAudience(tenantId, audience);
    
    return {
      total: resolved.total + resolved.duplicatesRemoved + resolved.optedOutRemoved + resolved.invalidRemoved,
      eligibleRecipients: resolved.total,
      duplicatesRemoved: resolved.duplicatesRemoved,
      optOutsRemoved: resolved.optedOutRemoved,
      invalidRemoved: resolved.invalidRemoved,
      spamRisk: resolved.spamRisk
    };
  }
}
