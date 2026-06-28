// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Version Registry (Point 5)
//
// Every analysis row, event, and job must reference specific version strings.
// Bump a version here when the corresponding component changes behaviour —
// this keeps historical analyses reproducible even after system upgrades.
// ═══════════════════════════════════════════════════════════════════════════

export const VERSIONS = {
  SIGNAL_ENGINE:   '1.0',  // bump when adding/changing signal patterns
  DECISION_ENGINE: '1.0',  // bump when changing status determination logic
  INDUSTRY_PACK:   '1.0',  // bump when changing industry modules
  PROMPT:          'v1',   // bump when changing Gemini prompt (Phase C)
  SCHEMA:          '1.0',  // bump when changing DB schema
  REASONING:       '1.0',  // bump when changing explainability output format
  RECOMMENDATION:  '1.0',  // bump when changing recommendation providers (Phase E)
} as const;

export type VersionComponent = keyof typeof VERSIONS;

// Snapshot of all active versions — attach to every AI analysis row.
export function currentVersionSnapshot(): {
  signal_engine_version:   string;
  decision_engine_version: string;
  industry_pack_version:   string;
  prompt_version:          string;
  schema_version:          string;
  reasoning_version:       string;
} {
  return {
    signal_engine_version:   VERSIONS.SIGNAL_ENGINE,
    decision_engine_version: VERSIONS.DECISION_ENGINE,
    industry_pack_version:   VERSIONS.INDUSTRY_PACK,
    prompt_version:          VERSIONS.PROMPT,
    schema_version:          VERSIONS.SCHEMA,
    reasoning_version:       VERSIONS.REASONING,
  };
}
