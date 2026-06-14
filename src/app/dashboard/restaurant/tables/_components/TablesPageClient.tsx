'use client';

import dynamic from 'next/dynamic';

const TablesClient = dynamic(
  () => import('./TablesClient').then(m => m.TablesClient),
  { ssr: false }
);

export function TablesPageClient() {
  return <TablesClient />;
}
