import { Metadata } from 'next';
import { LeadsClient } from './_components/LeadsClient';

export const metadata: Metadata = {
  title: 'Leads Pipeline | Aries AI',
  description: 'Track your leads through the sales pipeline with AI-powered scoring.',
};

export default function LeadsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <LeadsClient />
    </div>
  );
}
