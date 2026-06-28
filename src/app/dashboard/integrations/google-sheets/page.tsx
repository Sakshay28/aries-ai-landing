import { Metadata } from 'next';
import { Suspense } from 'react';
import { GoogleSheetsDashboard } from './_components/GoogleSheetsDashboard';
import { FeaturePageGate } from '../../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Google Sheets Integration | Aries AI',
  description: 'Manage your real-time CRM spreadsheet synchronization, column mappings, and sync health.',
};

export default function GoogleSheetsIntegrationPage() {
  return (
    <FeaturePageGate feature="Integrations" allowedPlans={["pro", "enterprise"]}>
      <div className="h-[calc(100vh-3.5rem)]">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading Google Sheets Integration Dashboard...
          </div>
        }>
          <GoogleSheetsDashboard />
        </Suspense>
      </div>
    </FeaturePageGate>
  );
}
