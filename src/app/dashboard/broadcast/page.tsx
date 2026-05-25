import { Metadata } from 'next';
import { BroadcastClient } from './_components/BroadcastClient';
import { FeaturePageGate } from '../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Broadcasts | Aries AI',
  description: 'Manage conversational broadcasts and AI outreach.',
};

export default function BroadcastPage() {
  return (
    <FeaturePageGate feature="Broadcasts" allowedPlans={['growth', 'pro', 'enterprise']}>
      <div className="h-[calc(100vh-3.5rem)]">
        <BroadcastClient />
      </div>
    </FeaturePageGate>
  );
}
