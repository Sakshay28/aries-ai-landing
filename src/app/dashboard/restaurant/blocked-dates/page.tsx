import { Metadata } from 'next';
import { BlockedDatesClient } from './_components/BlockedDatesClient';

export const metadata: Metadata = {
  title: 'Blocked Dates | Restaurant | Aries AI',
  description: 'Block dates to prevent reservations.',
};

export default function BlockedDatesPage() {
  return <BlockedDatesClient />;
}
