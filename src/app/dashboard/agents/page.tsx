import { Metadata } from 'next';
import { AgentsClient } from './_components/AgentsClient';

export const metadata: Metadata = {
  title: 'AI Agents | Aries AI',
  description: 'Manage specialized AI agents for different business roles',
};

export default function AgentsPage() {
  return (
    <div className="h-full">
      <AgentsClient />
    </div>
  );
}
