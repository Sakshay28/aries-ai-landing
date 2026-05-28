import { Metadata } from 'next';
import { RestaurantOverviewClient } from './_components/RestaurantOverviewClient';

export const metadata: Metadata = {
  title: 'Restaurant Overview | Aries AI',
  description: 'Manage your restaurant reservations and bookings.',
};

export default function RestaurantPage() {
  return <RestaurantOverviewClient />;
}
