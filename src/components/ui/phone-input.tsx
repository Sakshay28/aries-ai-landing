'use client';

/**
 * PhoneInput — Global standardized Indian phone number input.
 *
 * UX:
 *   ┌─────────────────────────────────────┐
 *   │  +91  │  98765 43210                │
 *   └─────────────────────────────────────┘
 *   The +91 prefix is fixed and non-editable.
 *   The user types only the 10-digit mobile number.
 *
 * Input  value: any format — "9876543210", "919876543210", "+919876543210"
 * Output value: "919876543210" (digits only, no +, always 91-prefixed)
 *
 * Usage:
 *   <PhoneInput value={phone} onChange={(v) => setPhone(v)} />
 */

import { extract10Digit } from '@/lib/utils/phone';

interface PhoneInputProps {
  value: string;
  onChange: (normalized: string) => void;  // always emits "91XXXXXXXXXX"
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = '98765 43210',
  className,
  disabled,
  id,
  required,
  autoFocus,
}: PhoneInputProps) {
  const digits10 = extract10Digit(value ?? '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip all non-digits first
    let raw = e.target.value.replace(/\D/g, '');

    // If the user typed/pasted the full number including the 91 country code
    // (e.g. "919876543210" or "919191919191"), strip the leading "91" so the
    // displayed value is always the 10-digit subscriber number only.
    if (raw.startsWith('91') && raw.length > 10) {
      raw = raw.slice(2);
    }

    // Clamp to 10 digits (the local subscriber number)
    raw = raw.slice(0, 10);

    // Emit the canonical "91XXXXXXXXXX" form, or empty string when blank
    onChange(raw ? '91' + raw : '');
  };

  return (
    <div
      className={`flex h-10 rounded-lg border border-border bg-background overflow-hidden
        focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary
        ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
        ${className ?? ''}`}
    >
      {/* Fixed +91 prefix */}
      <div className="flex items-center gap-1.5 px-3 bg-muted border-r border-border shrink-0 select-none">
        <span className="text-sm font-semibold text-muted-foreground">+91</span>
      </div>

      {/* 10-digit input */}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]{10}"
        maxLength={10}
        value={digits10}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className="flex-1 px-3 bg-transparent text-sm text-foreground outline-none
          placeholder:text-muted-foreground/50 disabled:cursor-not-allowed
          [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}
