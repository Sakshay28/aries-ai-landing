import { Metadata } from 'next';
import { GuestsClient } from './_components/GuestsClient';

export const metadata: Metadata = {
  title: 'Guests | Restaurant | Aries AI',
  description: 'Manage customer relationships, visit history and VIP guests.',
};

export default function GuestsPage() {
  return <GuestsClient />;
}
