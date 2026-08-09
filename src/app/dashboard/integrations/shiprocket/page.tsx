import { Metadata } from 'next';
import { Suspense } from 'react';
import { ShiprocketDashboard } from './_components/ShiprocketDashboard';
import { FeaturePageGate } from '../../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Shiprocket Integration | Aries AI',
  description: 'Connect Shiprocket to ship orders, track shipments, and send WhatsApp delivery updates.',
};

export default function ShiprocketIntegrationPage() {
  return (
    <FeaturePageGate feature="Integrations" allowedPlans={["pro", "enterprise"]}>
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading Shiprocket integration…</div>}>
          <ShiprocketDashboard />
        </Suspense>
      </div>
    </FeaturePageGate>
  );
}
