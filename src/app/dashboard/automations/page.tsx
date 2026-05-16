import { Metadata } from 'next';
import { AutomationsClient } from './_components/AutomationsClient';

export const metadata: Metadata = {
  title: 'Automations | Aries AI',
  description: 'AI-native conversational automation operating system.',
};

export default function AutomationsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <AutomationsClient />
    </div>
  );
}
