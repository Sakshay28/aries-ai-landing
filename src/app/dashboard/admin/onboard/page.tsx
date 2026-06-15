import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { OnboardClient } from './_components/OnboardClient';

export const metadata: Metadata = { title: 'Onboard Client | Aries AI' };

// Platform-admin only. Non-admins are bounced before any client code loads;
// the API is independently gated too, so this redirect is convenience, not
// the security boundary.
export default async function OnboardPage() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) redirect('/dashboard');
  return <OnboardClient />;
}
