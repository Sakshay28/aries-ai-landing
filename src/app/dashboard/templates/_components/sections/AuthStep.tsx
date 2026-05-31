'use client';

import { OTP_MODES, VALIDITY_PERIODS } from '../constants';
import type { TemplateFormState, OtpMode } from '../types';
import { ShieldCheck } from 'lucide-react';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

export default function AuthStep({ state, onChange }: Props) {
  const { otpMode, securityRecommendation, validityPeriod } = state;

  return (
    <div className="space-y-6">
      {/* Auth notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Authentication Template</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Authentication templates are strictly regulated by Meta. They can only contain an OTP
            delivery mechanism — no marketing, no custom body text. Meta pre-fills the body.
          </p>
        </div>
      </div>

      {/* OTP Delivery Mode */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          OTP Delivery Method
        </label>
        <div className="space-y-2">
          {OTP_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange({ otpMode: mode.id as OtpMode })}
              className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                otpMode === mode.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/30'
              }`}
            >
              <p className={`text-sm font-semibold ${otpMode === mode.id ? 'text-primary' : 'text-foreground'}`}>
                {mode.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Security recommendation */}
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card">
        <div>
          <p className="text-sm font-semibold text-foreground">Security Recommendation</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Append "For your security, do not share this code." to the message.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={securityRecommendation}
          onClick={() => onChange({ securityRecommendation: !securityRecommendation })}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${securityRecommendation ? 'bg-primary' : 'bg-muted border border-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${securityRecommendation ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Validity period */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Code Expiry Time
        </label>
        <div className="flex flex-wrap gap-2">
          {VALIDITY_PERIODS.map((vp) => (
            <button
              key={vp.value}
              type="button"
              onClick={() => onChange({ validityPeriod: vp.value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                validityPeriod === vp.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {vp.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Meta will display a countdown or expiry message below the OTP.
        </p>
      </div>

      {/* Preview summary */}
      <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">What Meta will show</p>
        <p className="text-xs text-foreground leading-relaxed">
          <span className="font-bold">827182</span> is your verification code.
          {securityRecommendation && ' For your security, do not share this code.'}
        </p>
        {validityPeriod && (
          <p className="text-[11px] text-muted-foreground">
            This code expires in {Math.round(validityPeriod / 60)} minute{validityPeriod !== 60 ? 's' : ''}.
          </p>
        )}
        <div className="pt-1 border-t border-border">
          <p className="text-[11px] text-[#00a5f4] font-medium">
            {otpMode === 'COPY_CODE' && '📋 Copy Code button'}
            {otpMode === 'ONE_TAP' && '✅ Autofill button (1 tap)'}
            {otpMode === 'ZERO_TAP' && '✓ Will autofill automatically (zero tap)'}
          </p>
        </div>
      </div>
    </div>
  );
}
