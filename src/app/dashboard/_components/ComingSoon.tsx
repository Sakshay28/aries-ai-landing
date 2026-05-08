// Shared placeholder for routes that are nav-targets but not yet built.
// Tailwind only — no styled-jsx, no inline style objects.

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
          <p className="text-sm text-zinc-500">{description ?? 'This area is coming soon.'}</p>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-6 text-sm text-zinc-500">
        We&apos;re polishing this section. It will be available shortly with full functionality.
      </div>
    </div>
  );
}
