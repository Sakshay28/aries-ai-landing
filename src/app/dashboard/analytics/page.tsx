import { Metadata } from 'next';
import { AnalyticsClient } from './_components/AnalyticsClient';
import { FeaturePageGate } from '../_layout/FeaturePageGate';

export const metadata: Metadata = {
  title: 'Analytics | Aries AI',
  description: 'Monitor your AI performance and conversation metrics.',
};

export default function AnalyticsPage() {
  return (
    <FeaturePageGate feature="Analytics" allowedPlans={['growth', 'pro', 'enterprise']}>
      <div className="h-[calc(100vh-3.5rem)]">
        <AnalyticsClient />
      </div>
    </FeaturePageGate>
  );
}
