import { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopifyDashboard } from './_components/ShopifyDashboard';
import { FeaturePageGate } from '../../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Shopify Integration | Aries AI',
  description: 'Connect a Shopify Custom App, sync your catalog, and power AI shopping over WhatsApp.',
};

export default function ShopifyIntegrationPage() {
  return (
    <FeaturePageGate feature="Integrations" allowedPlans={["pro", "enterprise"]}>
      <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
        <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading Shopify integration…</div>}>
          <ShopifyDashboard />
        </Suspense>
      </div>
    </FeaturePageGate>
  );
}
