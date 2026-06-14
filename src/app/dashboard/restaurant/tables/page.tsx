import { Metadata } from 'next';
import { TablesPageClient } from './_components/TablesPageClient';

export const metadata: Metadata = {
  title: 'Tables | Aries AI',
  description: 'Real-time table status board for your restaurant.',
};

export default function TablesPage() {
  return <TablesPageClient />;
}
