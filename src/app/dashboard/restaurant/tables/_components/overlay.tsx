'use client';

import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
}

/** Centered dialog on desktop, bottom-sheet on mobile. */
export function Modal({
  onClose, title, children, footer, maxWidth = 'max-w-md',
}: {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  useDismiss(onClose);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog" aria-modal="true"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={`w-full ${maxWidth} bg-background border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6 shrink-0">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 pb-2 overflow-y-auto grow">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-border shrink-0">{footer}</div>}
        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
      </motion.div>
    </motion.div>
  );
}

/** Right-side slide-over (full-height). */
export function SidePanel({
  onClose, title, children, footer,
}: {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useDismiss(onClose);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="w-full max-w-md h-full bg-background border-l border-border shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto grow p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border shrink-0">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}

/** Numeric stepper used for guest counts. */
export function GuestStepper({
  value, onChange, min = 1, max = 50, quick = [2, 4, 6, 8],
}: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; quick?: number[];
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min}
          className="h-11 w-11 rounded-xl border border-border text-xl font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer">−</button>
        <div className="h-11 min-w-[4rem] grow rounded-xl bg-muted flex items-center justify-center text-lg font-semibold tabular-nums">
          {value}
        </div>
        <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}
          className="h-11 w-11 rounded-xl border border-border text-xl font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer">+</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {quick.map((n) => (
          <button key={n} type="button" onClick={() => onChange(clamp(n))}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${value === n ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
