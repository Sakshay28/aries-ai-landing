import { Metadata } from 'next';
import { TeamClient } from './_components/TeamClient';

export const metadata: Metadata = {
  title: 'Team Management | Aries AI',
  description: 'Invite team members, assign roles, and manage access to your workspace.',
};

export default function TeamPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <TeamClient />
    </div>
  );
}
