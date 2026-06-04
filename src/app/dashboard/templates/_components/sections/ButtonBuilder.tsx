'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  GripVertical,
  CornerDownLeft,
  ExternalLink,
  Phone,
  Copy,
  AlertCircle
} from 'lucide-react';
import type { TemplateButton, ButtonType, TemplateFormState } from '../types';
import { PhoneInput } from '@/components/ui/phone-input';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

const BUTTON_TYPES = [
  {
    id: 'QUICK_REPLY',
    label: 'Quick Reply',
    icon: CornerDownLeft,
    desc: 'Interactive buttons for fast, tap-to-reply inputs.',
    example: '"Confirm ✅", "Cancel ❌", "Reschedule 📅"',
    limit: 3,
  },
  {
    id: 'URL',
    label: 'Visit Website',
    icon: ExternalLink,
    desc: 'Directs users to a website link (static or dynamic tracking).',
    example: '"Track Order 📦", "Visit Website 🌐"',
    limit: 2,
  },
  {
    id: 'PHONE_NUMBER',
    label: 'Call Phone',
    icon: Phone,
    desc: 'Initiates an immediate phone call to your business line.',
    example: '"Call Support 📞", "Contact Guide 🧭"',
    limit: 1,
  },
  {
    id: 'COPY_CODE',
    label: 'Copy Code',
    icon: Copy,
    desc: 'Copies a custom verification or discount code to clipboard.',
    example: '"Copy Code 📋", "Copy Coupon 🎫"',
    limit: 1,
  },
] as const;

function generateId() {
  return Math.random().toString(36).slice(2);
}

export default function ButtonBuilder({ state, onChange }: Props) {
  const { buttons } = state;

  const qrCount = buttons.filter((b) => b.type === 'QUICK_REPLY').length;
  const urlCount = buttons.filter((b) => b.type === 'URL').length;
  const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
  const copyCount = buttons.filter((b) => b.type === 'COPY_CODE').length;

  const getLimitStatus = (type: ButtonType) => {
    if (type === 'QUICK_REPLY') return { count: qrCount, max: 3, reached: qrCount >= 3 };
    if (type === 'URL') return { count: urlCount, max: 2, reached: urlCount >= 2 };
    if (type === 'PHONE_NUMBER') return { count: phoneCount, max: 1, reached: phoneCount >= 1 };
    if (type === 'COPY_CODE') return { count: copyCount, max: 1, reached: copyCount >= 1 };
    return { count: 0, max: 0, reached: false };
  };

  const addButton = (type: ButtonType) => {
    const status = getLimitStatus(type);
    if (status.reached || buttons.length >= 10) return;

    const newBtn: TemplateButton = {
      id: generateId(),
      type,
      text: '',
      ...(type === 'URL' ? { url: '', urlType: 'STATIC' } : {}),
      ...(type === 'PHONE_NUMBER' ? { phoneNumber: '' } : {}),
    };
    onChange({ buttons: [...buttons, newBtn] });
  };

  const updateButton = (id: string, updates: Partial<TemplateButton>) => {
    onChange({ buttons: buttons.map((b) => b.id === id ? { ...b, ...updates } : b) });
  };

  const removeButton = (id: string) => {
    onChange({ buttons: buttons.filter((b) => b.id !== id) });
  };

  return (
    <div className="space-y-6">
      {/* ── BUTTON TYPE CARD GRID ── */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-3">
          Select Button Type to Add
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BUTTON_TYPES.map((bt) => {
            const status = getLimitStatus(bt.id);
            const Icon = bt.icon;

            return (
              <button
                key={bt.id}
                type="button"
                onClick={() => addButton(bt.id)}
                disabled={status.reached || buttons.length >= 10}
                className={`relative overflow-hidden text-left p-4 rounded-xl border transition-all flex flex-col justify-between group h-[130px] ${
                  status.reached
                    ? 'bg-muted/30 border-border/60 text-muted-foreground opacity-50 cursor-not-allowed'
                    : 'bg-card border-border/80 hover:border-primary/50 text-card-foreground hover:bg-muted/10 hover:shadow-[0_2px_8px_rgba(var(--primary-rgb),0.04)] active:scale-[0.98]'
                }`}
              >
                {/* Background Accent glow */}
                {!status.reached && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                )}

                {/* Top Row: Icon and Usage Badge */}
                <div className="w-full flex items-center justify-between shrink-0">
                  <div className={`p-2 rounded-lg ${status.reached ? 'bg-muted text-muted-foreground/60' : 'bg-primary/5 text-primary'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-[6px] ${status.reached ? 'bg-muted-foreground/10 text-muted-foreground' : status.count > 0 ? 'bg-primary/10 text-primary' : 'bg-border text-muted-foreground'}`}>
                    {status.count} / {bt.limit} used
                  </span>
                </div>

                {/* Info Area */}
                <div className="mt-3 min-w-0">
                  <h4 className="text-xs font-bold text-foreground leading-none flex items-center gap-1.5">
                    {bt.label}
                  </h4>
                  <p className="text-[10.5px] text-muted-foreground/80 leading-normal mt-1 truncate">
                    {bt.desc}
                  </p>
                  <p className="text-[9px] font-mono text-muted-foreground/60 leading-none mt-1 truncate">
                    Ex: {bt.example}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONFIGURED BUTTONS LIST ── */}
      {buttons.length > 0 && (
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Configure Interactive Buttons ({buttons.length} of 10)
          </label>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {buttons.map((btn, index) => {
                const typeConfig = BUTTON_TYPES.find((t) => t.id === btn.type);
                const Icon = typeConfig?.icon || CornerDownLeft;

                return (
                  <motion.div
                    key={btn.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="flex items-start gap-3 p-4 rounded-xl border border-border/80 bg-card hover:border-border/120 shadow-sm transition-all"
                  >
                    {/* Drag Handle */}
                    <div className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors shrink-0 mt-1">
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {/* Inputs */}
                    <div className="flex-1 space-y-3 min-w-0">
                      {/* Button Label row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-foreground">
                            {typeConfig?.label}
                          </span>
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            Button {index + 1}
                          </span>
                        </div>

                        {/* Character count checker */}
                        <span className={`text-[10px] font-semibold ${btn.text.length > 25 ? 'text-red-500' : 'text-muted-foreground/60'}`}>
                          {btn.text.length}/25 chars
                        </span>
                      </div>

                      {/* Display Text input */}
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => updateButton(btn.id, { text: e.target.value })}
                        placeholder="Button text label (e.g. Visit Website)"
                        maxLength={35}
                        className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all font-medium"
                      />

                      {/* URL Type config inputs */}
                      {btn.type === 'URL' && (
                        <div className="space-y-2 pt-1 border-t border-border/40">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                              URL Format:
                            </label>
                            <div className="flex bg-muted p-0.5 rounded-lg border border-border/60">
                              <button
                                type="button"
                                onClick={() => updateButton(btn.id, { urlType: 'STATIC' })}
                                className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                                  btn.urlType === 'STATIC'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                Static URL
                              </button>
                              <button
                                type="button"
                                onClick={() => updateButton(btn.id, { urlType: 'DYNAMIC' })}
                                className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                                  btn.urlType === 'DYNAMIC'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                Dynamic URL
                              </button>
                            </div>
                          </div>

                          <input
                            type="url"
                            value={btn.url ?? ''}
                            onChange={(e) => updateButton(btn.id, { url: e.target.value })}
                            placeholder={
                              btn.urlType === 'DYNAMIC'
                                ? 'https://track.aries.ai/order/{{1}}'
                                : 'https://example.com'
                            }
                            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all font-mono"
                          />

                          {btn.urlType === 'DYNAMIC' && (
                            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-primary/5 text-primary text-[10px] leading-relaxed">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <p>
                                Use <code className="font-mono bg-primary/10 px-1 py-0.5 rounded">{'{{1}}'}</code> as the dynamic variable token. You will pass dynamic URLs to Meta at sending time.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Phone inputs */}
                      {btn.type === 'PHONE_NUMBER' && (
                        <div className="space-y-1.5 pt-1 border-t border-border/40">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Business Phone Number
                          </label>
                          <PhoneInput
                            value={btn.phoneNumber ?? ''}
                            onChange={(v) => updateButton(btn.id, { phoneNumber: v })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Delete action */}
                    <button
                      type="button"
                      onClick={() => removeButton(btn.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-all shrink-0 mt-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {buttons.length === 0 && (
        <div className="text-center p-4 border border-dashed border-border/80 rounded-xl bg-muted/10">
          <p className="text-[11px] text-muted-foreground font-medium">
            No interactive buttons configured yet. Select a button type card above to add quick reply actions, tracking links, call prompts, or coupon code copy steps.
          </p>
        </div>
      )}
    </div>
  );
}
