import { Metadata } from 'next';
import { LogsClient } from './_components/LogsClient';

export const metadata: Metadata = {
  title: 'System Logs | Aries AI',
  description: 'Real-time webhook and API delivery logs.',
};

export default function LogsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <LogsClient />
    </div>
  );
}
