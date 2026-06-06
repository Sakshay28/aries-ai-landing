import { Metadata } from 'next';
import { MetaAdsDashboardClient } from './_components/MetaAdsDashboardClient';

export const metadata: Metadata = {
  title: 'Meta Ads | Aries AI',
  description: 'Manage your Meta Click-to-WhatsApp campaigns and track ad performance.',
};

export default function MetaAdsDashboardPage() {
  return <MetaAdsDashboardClient />;
}
