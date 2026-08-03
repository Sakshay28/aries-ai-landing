'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard route error]', error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
        This section couldn&apos;t load.
      </p>
      <p className="max-w-sm text-xs" style={{ color: 'var(--muted-foreground)' }}>
        The rest of the dashboard is unaffected — try again, or switch to another section from the sidebar.
      </p>
      <Button size="sm" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  );
}
