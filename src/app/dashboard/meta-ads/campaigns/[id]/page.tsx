import { Metadata } from 'next';
import { CampaignDetailClient } from '../../_components/CampaignDetailClient';

export const metadata: Metadata = {
  title: 'Campaign Details | Aries AI',
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetailClient id={id} />;
}
