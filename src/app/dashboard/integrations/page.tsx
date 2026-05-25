import { Metadata } from 'next';
import { Suspense } from 'react';
import { IntegrationsClient } from './_components/IntegrationsClient';
import { FeaturePageGate } from '../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Integrations | Aries AI',
  description: 'Connect Shopify, HubSpot, Salesforce, and more to sync your data.',
};

export default function IntegrationsPage() {
  return (
    <FeaturePageGate feature="Integrations" allowedPlans={["pro", "enterprise"]}>
      <div className="h-[calc(100vh-3.5rem)]">
        <Suspense>
          <IntegrationsClient />
        </Suspense>
      </div>
    </FeaturePageGate>
  );
}

