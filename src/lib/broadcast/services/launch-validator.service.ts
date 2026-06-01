import { CampaignFormValues, validateCampaignPreflight } from '@/app/dashboard/broadcast/validators/broadcast.validator';

interface LaunchValidationResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  confidenceScore: number;
}

export class LaunchValidatorService {
  /**
   * Performs high-fidelity server-side campaign validations prior to enqueuing.
   */
  static validate(
    values: Partial<CampaignFormValues>,
    detectedVarIndices: string[],
    netRecipients: number
  ): LaunchValidationResult {
    const checks = validateCampaignPreflight(values, detectedVarIndices, netRecipients);

    const blockers: string[] = [];
    const warnings: string[] = [];

    checks.forEach(c => {
      if (c.status === 'fail') {
        blockers.push(c.message || `${c.label} failed validation`);
      } else if (c.status === 'warn') {
        warnings.push(c.message || `${c.label} warning flagged`);
      }
    });

    // Compute dynamic validation confidence score
    let confidenceScore = 100;
    confidenceScore -= blockers.length * 25;
    confidenceScore -= warnings.length * 10;
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    const ready = blockers.length === 0;

    return {
      ready,
      blockers,
      warnings,
      confidenceScore
    };
  }
}
