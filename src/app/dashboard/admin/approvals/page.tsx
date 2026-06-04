import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ApprovalsClient } from './_components/ApprovalsClient';

export const metadata: Metadata = { title: 'Approvals | Aries AI' };

export default async function ApprovalsPage() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) redirect('/dashboard');
  return <ApprovalsClient />;
}
