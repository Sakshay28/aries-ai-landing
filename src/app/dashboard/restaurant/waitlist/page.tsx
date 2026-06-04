import { Metadata } from 'next';
import { WaitlistClient } from './_components/WaitlistClient';

export const metadata: Metadata = {
  title: 'Waitlist | Restaurant | Aries AI',
  description: 'Manage the restaurant waitlist.',
};

export default function WaitlistPage() {
  return <WaitlistClient />;
}
