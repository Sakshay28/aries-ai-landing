import { Phone } from 'lucide-react';
import { ComingSoon } from '@/components/ui/coming-soon';

export default function VoicePage() {
  return (
    <ComingSoon
      icon={Phone}
      title="Voice Agent"
      description="AI-powered voice calls for lead qualification and customer support."
    />
  );
}
