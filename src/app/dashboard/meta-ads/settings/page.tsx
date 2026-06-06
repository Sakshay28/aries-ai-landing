import { Metadata } from 'next';
import { MetaAdsSettingsClient } from '../_components/MetaAdsSettingsClient';

export const metadata: Metadata = {
  title: 'Meta Ads — Connection | Aries AI',
  description: 'Connect your Meta Ads account to Aries AI.',
};

export default function MetaAdsSettingsPage() {
  return <MetaAdsSettingsClient />;
}
