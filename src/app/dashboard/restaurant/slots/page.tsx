import { Metadata } from 'next';
import { SlotsClient } from './_components/SlotsClient';

export const metadata: Metadata = {
  title: 'Slot Management | Restaurant | Aries AI',
  description: 'Manage restaurant time slots and seating capacity.',
};

export default function SlotsPage() {
  return <SlotsClient />;
}
