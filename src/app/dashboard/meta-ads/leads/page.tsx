import { Metadata } from 'next';
import { MetaAdsLeadsClient } from '../_components/MetaAdsLeadsClient';

export const metadata: Metadata = {
  title: 'Meta Ad Leads | Aries AI',
  description: 'Leads generated from your Meta Ads campaigns.',
};

export default function MetaAdsLeadsPage() {
  return <MetaAdsLeadsClient />;
}
