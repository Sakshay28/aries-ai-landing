import { Metadata } from 'next';
import { BillingClient } from './_components/BillingClient';

export const metadata: Metadata = {
  title: 'Billing | Aries AI',
  description: 'Manage your subscription and billing details.',
};

export default function BillingPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <BillingClient />
    </div>
  );
}
