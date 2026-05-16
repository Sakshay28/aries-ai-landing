import { redirect } from 'next/navigation';

export default function WhatsAppPage() {
  redirect('/dashboard/settings?tab=whatsapp');
}
