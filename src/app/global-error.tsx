'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global root error]', error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', color: '#fff' }}>
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 500 }}>Something went wrong.</p>
          <p style={{ fontSize: 12, color: '#a1a1aa', maxWidth: 360 }}>
            The app hit an unexpected error. Try again — if it keeps happening, refresh the page.
          </p>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', borderRadius: 6, background: '#4f46e5', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
