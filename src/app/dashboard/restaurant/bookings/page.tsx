import { Metadata } from 'next';
import { BookingsClient } from './_components/BookingsClient';

export const metadata: Metadata = {
  title: 'Bookings | Restaurant | Aries AI',
  description: 'View and manage restaurant reservations.',
};

export default function BookingsPage() {
  return <BookingsClient />;
}
