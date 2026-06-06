import { Metadata } from 'next';
import { MetaAdsAnalyticsClient } from '../_components/MetaAdsAnalyticsClient';

export const metadata: Metadata = {
  title: 'Meta Ads Analytics | Aries AI',
  description: 'ROI dashboard for your Meta Ads campaigns.',
};

export default function MetaAdsAnalyticsPage() {
  return <MetaAdsAnalyticsClient />;
}
