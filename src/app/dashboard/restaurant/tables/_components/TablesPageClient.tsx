'use client';

import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';

const TablesClient = dynamic(
  () => import('./TablesClient').then(m => m.TablesClient),
  { ssr: false }
);

export function TablesPageClient() {
  return (
    <>
      <TablesClient />
      <Toaster richColors position="top-center" />
    </>
  );
}
