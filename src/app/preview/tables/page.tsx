'use client';

import dynamic from 'next/dynamic';

const TablesDemo = dynamic(
  () => import('./TablesDemo').then(m => m.TablesDemo),
  { ssr: false }
);

export default function PreviewTablesPage() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <TablesDemo />
    </div>
  );
}
