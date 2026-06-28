import { Metadata } from 'next';
import { Suspense } from 'react';
import { MicrosoftExcelDashboard } from './_components/MicrosoftExcelDashboard';
import { FeaturePageGate } from '../../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Microsoft Excel Integration | Aries AI',
  description: 'Manage your real-time CRM workbook synchronization, settings, and sync health.',
};

export default function MicrosoftExcelIntegrationPage() {
  return (
    <FeaturePageGate feature="Integrations" allowedPlans={["pro", "enterprise"]}>
      <div className="h-[calc(100vh-3.5rem)]">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading Microsoft Excel Integration Dashboard...
          </div>
        }>
          <MicrosoftExcelDashboard />
        </Suspense>
      </div>
    </FeaturePageGate>
  );
}
