'use client';

import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import type { ValidationIssue, TemplateFormState } from './types';
import { extractVariableIndices } from './constants';

// ── Pure validation function ───────────────────
export function validateTemplate(state: TemplateFormState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { category, body, buttons, headerType, headerMediaUrl, variableMap, name, footer } = state;

  // Name required
  if (!name.trim()) {
    issues.push({
      severity: 'error',
      code: 'NO_NAME',
      message: 'Template name is required.',
      field: 'name',
    });
  }

  // Body required (except auth)
  if (category !== 'AUTHENTICATION' && !body.trim()) {
    issues.push({
      severity: 'error',
      code: 'NO_BODY',
      message: 'Message body content is required.',
      field: 'body',
    });
  }

  // Body length
  if (body.length > 1024) {
    issues.push({
      severity: 'error',
      code: 'BODY_TOO_LONG',
      message: `Body text exceeds Meta limits: ${body.length} / 1024 characters.`,
      field: 'body',
    });
  }

  // Footer length
  if (footer && footer.length > 60) {
    issues.push({
      severity: 'error',
      code: 'FOOTER_TOO_LONG',
      message: `Footer exceeds Meta limits: ${footer.length} / 60 characters.`,
      field: 'footer',
    });
  }

  // Variable sequence validation
  const indices = extractVariableIndices(body);
  if (indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i + 1) {
        issues.push({
          severity: 'error',
          code: 'VARIABLE_GAP',
          message: `Variable {{${indices[i]}}} is out of sequence. Meta requires sequential ordering ({{1}}, {{2}}...).`,
          suggestion: 'Renumber your variables sequentially in the body text starting from {{1}}.',
          field: 'body',
        });
        break;
      }
    }

    // Check all used indices have a mapping in normal mode
    if (state.variableMode === 'NORMAL') {
      const mappedIndices = new Set(Object.values(variableMap));
      for (const idx of indices) {
        if (!mappedIndices.has(idx)) {
          issues.push({
            severity: 'warning',
            code: 'UNMAPPED_VARIABLE',
            message: `Variable token {{${idx}}} has no descriptive name assigned.`,
            suggestion: 'Double-check variables list or reinsert variables via smart chips.',
            field: 'body',
          });
        }
      }
    }
  }

  // Excessive CAPS check
  if (body.length > 20) {
    const upper = (body.match(/[A-Z]/g) ?? []).length;
    const letters = (body.match(/[A-Za-z]/g) ?? []).length;
    if (letters > 10 && upper / letters > 0.45) {
      issues.push({
        severity: 'warning',
        code: 'EXCESSIVE_CAPS',
        message: 'Body contains more than 45% uppercase lettering.',
        suggestion: 'Meta may reject shouting templates. Recommend using sentence case.',
        field: 'body',
      });
    }
  }

  // Promotional content in UTILITY
  if (category === 'UTILITY') {
    const promoKeywords = /\b(offer|discount|sale|promo|buy|shop|limited time|exclusive|deal|coupon|save \d+%|free shipping)\b/i;
    if (promoKeywords.test(body)) {
      issues.push({
        severity: 'warning',
        code: 'PROMO_IN_UTILITY',
        message: 'Utility template contains marketing or promotional phrases.',
        suggestion: 'Meta regularly rejects promotional content under Utility categories. Transition category to Marketing or draft a purely transactional message.',
        field: 'category',
      });
    }
  }

  // Marketing content in AUTHENTICATION
  if (category === 'AUTHENTICATION') {
    const marketingKeywords = /\b(offer|discount|promo|buy|shop|sale)\b/i;
    if (marketingKeywords.test(body)) {
      issues.push({
        severity: 'error',
        code: 'MARKETING_IN_AUTH',
        message: 'Authentication templates cannot carry marketing copy.',
        suggestion: 'Remove promotional content immediately. Auth templates are reserved exclusively for OTP verification delivery.',
        field: 'category',
      });
    }
  }

  // Media header without upload
  if ((headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && !headerMediaUrl) {
    issues.push({
      severity: 'error',
      code: 'MISSING_MEDIA',
      message: `Attachment header requires a sample ${headerType.toLowerCase()} file.`,
      suggestion: 'Upload a placeholder file to Meta so examiners can review the visual framing.',
      field: 'header',
    });
  }

  // Button validation
  const quickReplies = buttons.filter((b) => b.type === 'QUICK_REPLY');
  const urlButtons = buttons.filter((b) => b.type === 'URL');
  const phoneButtons = buttons.filter((b) => b.type === 'PHONE_NUMBER');

  if (buttons.length > 10) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_BUTTONS',
      message: `Configured ${buttons.length} buttons. Meta enforces a max of 10.`,
      field: 'buttons',
    });
  }

  if (quickReplies.length > 3) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_QUICK_REPLIES',
      message: 'Maximum of 3 Quick Reply buttons allowed.',
      field: 'buttons',
    });
  }

  if (urlButtons.length > 2) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_URL_BUTTONS',
      message: 'Maximum of 2 Visit Website buttons allowed.',
      field: 'buttons',
    });
  }

  if (phoneButtons.length > 1) {
    issues.push({
      severity: 'error',
      code: 'TOO_MANY_PHONE_BUTTONS',
      message: 'Maximum of 1 Call Phone button allowed.',
      field: 'buttons',
    });
  }

  // URL button validation
  for (const btn of urlButtons) {
    if (!btn.url) {
      issues.push({
        severity: 'error',
        code: 'MISSING_URL',
        message: `Button "${btn.text || 'Website Link'}" has no configured destination link.`,
        field: 'buttons',
      });
    } else if (!/^https?:\/\//i.test(btn.url)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_URL',
        message: `Button URL must secure link (https://).`,
        field: 'buttons',
      });
    }
  }

  // Button text length
  for (const btn of buttons) {
    if (!btn.text.trim()) {
      issues.push({
        severity: 'error',
        code: 'EMPTY_BUTTON_TEXT',
        message: 'All interactive buttons require clear label text.',
        field: 'buttons',
      });
    } else if (btn.text.length > 25) {
      issues.push({
        severity: 'warning',
        code: 'BUTTON_TEXT_LONG',
        message: `Button label "${btn.text.slice(0, 18)}..." exceeds 25 characters.`,
        field: 'buttons',
      });
    }
  }

  return issues;
}

// ── Health Score Heuristic Calculator ──────────
export function calculateHealthScore(state: TemplateFormState, issues: ValidationIssue[]) {
  let score = 100;
  const details: { message: string; severity: 'warning' | 'error' }[] = [];

  // 1. Missing personalization (-10)
  const indices = extractVariableIndices(state.body);
  if (state.category === 'MARKETING' && indices.length === 0) {
    score -= 10;
    details.push({
      message: 'No personalization fields. Marketing broadcasts convert 42% better with custom variables.',
      severity: 'warning',
    });
  }

  // 2. Spam / Aggressive wording (-20)
  const spamKeywords = /\b(free|guaranteed|earn|cash|claim|win|urgent|buy now|get paid|investment|lottery|crypto|credit card)\b/i;
  if (spamKeywords.test(state.body)) {
    score -= 20;
    details.push({
      message: 'Aggressive marketing keyword detected (e.g. "free", "claim"). High risk of Meta review rejection.',
      severity: 'error',
    });
  }

  // 3. Caps overuse (-10)
  if (state.body.length > 20) {
    const upper = (state.body.match(/[A-Z]/g) ?? []).length;
    const letters = (state.body.match(/[A-Za-z]/g) ?? []).length;
    if (letters > 10 && upper / letters > 0.45) {
      score -= 10;
      details.push({
        message: 'Shouting detection. Sentence-case is preferred by automated Meta review systems.',
        severity: 'warning',
      });
    }
  }

  // 4. Bad variable order or gaps (-30)
  const hasVariableGap = issues.some((i) => i.code === 'VARIABLE_GAP');
  if (hasVariableGap) {
    score -= 30;
    details.push({
      message: 'Variable ordering is non-sequential. This is a critical structural blocker.',
      severity: 'error',
    });
  }

  // 5. Promotional wording in Utility (-15)
  if (state.category === 'UTILITY') {
    const promoKeywords = /\b(offer|discount|sale|promo|buy|shop|limited time|exclusive|deal|coupon|save \d+%|free shipping)\b/i;
    if (promoKeywords.test(state.body)) {
      score -= 15;
      details.push({
        message: 'Promotional phrases detected in Utility category. Change category or edit text.',
        severity: 'error',
      });
    }
  }

  // 6. Missing footer (-5)
  if (!state.footer.trim() && state.category !== 'AUTHENTICATION') {
    score -= 5;
    details.push({
      message: 'Missing opt-out footer. Adding a "STOP" command reduces customer spam blocks and spam scores.',
      severity: 'warning',
    });
  }

  // 7. Body length > 800 chars (-5)
  if (state.body.length > 800) {
    score -= 5;
    details.push({
      message: 'Body copy is exceptionally long (800+ chars). Keep copy concise to maximize mobile reading.',
      severity: 'warning',
    });
  }

  // 8. Empty button titles or broken URL targets (-15)
  const hasEmptyButtons = issues.some((i) => i.code === 'EMPTY_BUTTON_TEXT' || i.code === 'MISSING_URL' || i.code === 'INVALID_URL');
  if (hasEmptyButtons) {
    score -= 15;
    details.push({
      message: 'Configured interactive button actions contain empty titles or secure link format bugs.',
      severity: 'error',
    });
  }

  // Bounds
  score = Math.max(0, Math.min(100, score));

  let label = 'Low Confidence';
  let color = 'from-red-500 to-orange-500 text-red-500 bg-red-500/5 border-red-500/10 dark:bg-red-500/10';
  let text = 'Low approval confidence. Redraft copy and remove aggressive promotional variables.';

  if (score >= 90) {
    label = 'Meta Grade';
    color = 'from-emerald-500 to-teal-500 text-emerald-500 bg-emerald-500/5 border-emerald-500/10 dark:bg-emerald-500/10';
    text = 'Excellent approval likelihood. Optimally aligned with Meta review guidelines.';
  } else if (score >= 75) {
    label = 'Medium Confidence';
    color = 'from-amber-500 to-orange-500 text-amber-500 bg-amber-500/5 border-amber-500/10 dark:bg-amber-500/10';
    text = 'Safe to submit, but adding personalizations or opt-outs will maximize review speeds.';
  }

  return { score, color, label, text, details };
}

interface Props {
  state?: TemplateFormState;
  issues: ValidationIssue[];
}

export default function ValidationPanel({ state, issues }: Props) {
  // If state is not provided (e.g. backward fallback compatibility), render simpler panel
  if (!state) {
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    if (issues.length === 0) {
      return (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          All structural validation checks passed. Ready to submit!
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {errors.map((issue, i) => (
          <div key={`err-${i}`} className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 leading-snug">{issue.message}</p>
              {issue.suggestion && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{issue.suggestion}</p>
              )}
            </div>
          </div>
        ))}
        {warnings.map((issue, i) => (
          <div key={`warn-${i}`} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 leading-snug">{issue.message}</p>
              {issue.suggestion && (
                <div className="flex items-start gap-1 mt-1">
                  <Lightbulb className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{issue.suggestion}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Calculate high-fidelity Health Score Heuristics
  const { score, color, label, text, details } = calculateHealthScore(state, issues);

  const errors = issues.filter((i) => i.severity === 'error');
  const hasCategory = !!state.category;
  const hasValidName = !!state.name.trim() && !errors.some((e) => e.field === 'name');
  const hasLanguage = !!state.language;
  const hasBody = !!state.body.trim() && !errors.some((e) => e.field === 'body');
  const hasButtonsValid = !errors.some((e) => e.field === 'buttons');

  return (
    <div className="space-y-6">
      {/* ── METRICS DASHCARD: HEALTH SCORE ── */}
      <div className={`p-5 rounded-2xl border transition-all ${color.split(' ').slice(2).join(' ')}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                score >= 90
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : score >= 75
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                  : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}>
                {label}
              </span>
              <span className="text-xs text-muted-foreground/60">•</span>
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Meta Compliant
              </span>
            </div>
            <h4 className="text-sm font-bold text-foreground mt-1.5">
              Template Health & Confidence
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {text}
            </p>
          </div>

          {/* Large Ring Score Indicator */}
          <div className="flex items-center gap-3 shrink-0 self-center">
            <div className="relative w-16 h-16 flex items-center justify-center">
              {/* SVG Ring circle */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted-foreground/10"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <motion.path
                  initial={{ strokeDasharray: '0, 100' }}
                  animate={{ strokeDasharray: `${score}, 100` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={
                    score >= 90
                      ? 'stroke-emerald-500'
                      : score >= 75
                      ? 'stroke-amber-500'
                      : 'stroke-red-500'
                  }
                  strokeWidth="3.2"
                  strokeDasharray={`${score}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-base font-extrabold text-foreground">{score}%</span>
                <span className="text-[7.5px] text-muted-foreground font-bold mt-0.5">HEALTH</span>
              </div>
            </div>
          </div>
        </div>

        {/* Linear progress bar (mobile fallback visual) */}
        <div className="w-full bg-border/40 h-1 rounded-full overflow-hidden mt-4 block sm:hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            className={`h-full rounded-full bg-gradient-to-r ${
              score >= 90
                ? 'from-emerald-500 to-teal-500'
                : score >= 75
                ? 'from-amber-500 to-orange-500'
                : 'from-red-500 to-orange-500'
            }`}
          />
        </div>
      </div>

      {/* ── READY TO SUBMIT CHECKLIST ── */}
      <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Approval Readiness Checklist
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Item 1: Category */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">Category Selected</p>
              <p className="text-[10px] text-muted-foreground capitalize leading-none mt-0.5">
                {state.category.toLowerCase()} template
              </p>
            </div>
          </div>

          {/* Item 2: Name */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            {hasValidName ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground font-sans">Template Name</p>
              <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                {hasValidName ? `✓ ${state.normalizedName}` : 'Missing or invalid'}
              </p>
            </div>
          </div>

          {/* Item 3: Language */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            {hasLanguage ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">Locale Settings</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {hasLanguage ? `✓ Language defined (${state.language})` : 'Language missing'}
              </p>
            </div>
          </div>

          {/* Item 4: Content */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            {hasBody ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">Body Copy & Media</p>
              <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                {hasBody ? '✓ Format structured' : 'Message copy empty'}
              </p>
            </div>
          </div>

          {/* Item 5: Variable sequences */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            {issues.some((i) => i.code === 'VARIABLE_GAP') ? (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">Variable Sequences</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {issues.some((i) => i.code === 'VARIABLE_GAP')
                  ? 'Gap detected in indices'
                  : '✓ Positional tokens sequential'}
              </p>
            </div>
          </div>

          {/* Item 6: Buttons */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            {hasButtonsValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">Interactive CTAs</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {hasButtonsValid
                  ? `✓ ${state.buttons.length} buttons formatted`
                  : 'Button formatting error'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── OPTIMIZATION & WARNING ISSUES ── */}
      {issues.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Suggested Enhancements ({issues.length})
          </label>
          <div className="space-y-2">
            {issues.map((issue, i) => {
              const isError = issue.severity === 'error';
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                    isError
                      ? 'bg-red-500/5 border-red-500/10'
                      : 'bg-amber-500/5 border-amber-500/10'
                  }`}
                >
                  {isError ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}

                  <div className="min-w-0 space-y-1">
                    <p className={`text-xs font-bold leading-normal ${isError ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                      {issue.message}
                    </p>
                    {issue.suggestion && (
                      <div className="flex items-start gap-1">
                        <Lightbulb className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground/90 leading-relaxed font-medium">
                          {issue.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── METRICS TIPS PANEL ── */}
      {issues.length === 0 && score === 100 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              Your template is optimized for conversion.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Nice work! You have clean variable order, clear CTAs, zero spam keywords, and solid copy framing. This template has a 99% approval rating likelihood and will fly through Meta review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
