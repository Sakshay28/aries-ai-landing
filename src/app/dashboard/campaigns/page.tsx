import { Metadata } from 'next';
import { CampaignsClient } from './_components/CampaignsClient';

export const metadata: Metadata = {
  title: 'Tracking Campaigns | Aries AI',
  description: 'Create trackable WhatsApp links to separate leads by source and batch.',
};

export default function CampaignsPage() {
  return <CampaignsClient />;
}
