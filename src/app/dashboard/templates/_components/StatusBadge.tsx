'use client';

import type { TemplateStatus } from './types';

const STATUS_CONFIG: Record<TemplateStatus, {
  label: string;
  dot: string;
  bg: string;
  text: string;
  border: string;
}> = {
  DRAFT: {
    label: 'Draft',
    dot: 'bg-zinc-400',
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-500/20',
  },
  READY: {
    label: 'Ready',
    dot: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
  },
  PENDING: {
    label: 'Pending Review',
    dot: 'bg-amber-400 animate-pulse',
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20',
  },
  APPROVED: {
    label: 'Approved',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/20',
  },
  REJECTED: {
    label: 'Rejected',
    dot: 'bg-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
  },
  PAUSED: {
    label: 'Paused',
    dot: 'bg-orange-400',
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20',
  },
  DISABLED: {
    label: 'Disabled',
    dot: 'bg-zinc-600',
    bg: 'bg-zinc-600/10',
    text: 'text-zinc-500',
    border: 'border-zinc-600/20',
  },
};

interface Props {
  status: TemplateStatus | string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const cfg = STATUS_CONFIG[(status as TemplateStatus)] ?? STATUS_CONFIG.DRAFT;
  const px = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold tracking-wide ${px} ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
