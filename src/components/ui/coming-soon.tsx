'use client';

import { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  eta?: string;
}

export function ComingSoon({ title, description, icon: Icon, eta }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      {/* Icon ring */}
      <div className="relative mb-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <Icon size={36} style={{ color: '#06B6D4' }} strokeWidth={1.5} />
        </div>
        {/* Subtle glow */}
        <div
          className="absolute inset-0 rounded-2xl blur-xl opacity-30"
          style={{ background: 'radial-gradient(circle, #06B6D4, transparent 70%)' }}
        />
      </div>

      {/* Text */}
      <h2
        className="text-xl font-medium mb-3 tracking-tight"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h2>
      <p
        className="text-sm max-w-sm leading-relaxed mb-6"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {description}
      </p>

      {/* ETA badge */}
      {eta && (
        <div
          className="text-xs font-medium px-3 py-1.5 rounded-full mb-6"
          style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            color: '#06B6D4',
          }}
        >
          {eta}
        </div>
      )}

      {/* Notify button */}
      <button
        className="text-sm font-medium px-5 py-2.5 rounded-xl transition-all duration-200 hover:opacity-80 active:scale-95"
        style={{
          background: 'var(--secondary)',
          color: 'var(--muted-foreground)',
          border: '1px solid var(--border)',
        }}
        onClick={() => {}}
      >
        Notify me when ready
      </button>
    </div>
  );
}
