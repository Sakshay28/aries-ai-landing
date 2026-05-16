import { Metadata } from 'next';
import { ContactsClient } from './_components/ContactsClient';

export const metadata: Metadata = {
  title: 'Contacts | Aries AI',
  description: 'Conversational Intelligence and Identity System.',
};

export default function ContactsPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <ContactsClient />
    </div>
  );
}
