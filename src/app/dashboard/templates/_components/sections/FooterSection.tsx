'use client';

import type { TemplateFormState } from '../types';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

export default function FooterSection({ state, onChange }: Props) {
  const { footer } = state;
  const maxChars = 60;
  const isOver = footer.length > maxChars;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Footer <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
        </label>
        <span className={`text-[10px] font-mono ${isOver ? 'text-red-500' : 'text-muted-foreground/60'}`}>
          {footer.length}/{maxChars}
        </span>
      </div>
      <input
        type="text"
        value={footer}
        onChange={(e) => onChange({ footer: e.target.value })}
        maxLength={70}
        placeholder="e.g. Reply STOP to unsubscribe · Powered by Aries"
        className={`w-full bg-background border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 transition-all ${
          isOver
            ? 'border-red-500 focus:ring-red-500/40'
            : 'border-border focus:ring-primary/40 focus:border-primary/50'
        }`}
      />
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Appears as small grey text below the message body. Max 60 characters.
        Common uses: unsubscribe info, brand tagline, or contact hint.
      </p>
    </div>
  );
}
