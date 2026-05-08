export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description ?? 'This area is coming soon.'}</p>
      </div>
    </div>
  );
}
