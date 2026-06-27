import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { AdminDashboardClient } from './_components/AdminDashboardClient';

export const metadata: Metadata = { title: 'Admin Dashboard | Aries AI' };

export default async function AdminDashboardPage() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) redirect('/dashboard');
  return <AdminDashboardClient />;
}
