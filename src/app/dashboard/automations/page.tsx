import { Metadata } from 'next';
import { AutomationsClient } from './_components/AutomationsClient';
import { FeaturePageGate } from '../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Automations | Aries AI',
  description: 'AI-native conversational automation operating system.',
};

export default function AutomationsPage() {
  return (
    <FeaturePageGate feature="Automations" allowedPlans={['starter', 'growth', 'pro', 'enterprise']}>
      <div className="h-[calc(100vh-3.5rem)]">
        <AutomationsClient />
      </div>
    </FeaturePageGate>
  );
}
