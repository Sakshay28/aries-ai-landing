import { Metadata } from 'next';
import { AnalyticsClient } from './_components/AnalyticsClient';

export const metadata: Metadata = {
  title: 'Analytics | Aries AI',
  description: 'Monitor your AI performance and conversation metrics.',
};

export default function AnalyticsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <AnalyticsClient />
    </div>
  );
}
