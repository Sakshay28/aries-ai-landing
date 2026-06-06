import { Metadata } from 'next';
import { CampaignDetailClient } from '../../_components/CampaignDetailClient';

export const metadata: Metadata = {
  title: 'Campaign Details | Aries AI',
};

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  return <CampaignDetailClient id={params.id} />;
}
