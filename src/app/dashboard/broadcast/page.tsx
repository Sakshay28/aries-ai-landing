import { Metadata } from 'next';
import { BroadcastClient } from './_components/BroadcastClient';

export const metadata: Metadata = {
  title: 'Broadcasts | Aries AI',
  description: 'Manage conversational broadcasts and AI outreach.',
};

export default function BroadcastPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <BroadcastClient />
    </div>
  );
}
