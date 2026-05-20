import type { Metadata } from "next";
import LandingPageClient from "./_components/LandingPageClient";

export const metadata: Metadata = {
  title: "Aries AI - AI-Powered WhatsApp Automation for Indian Businesses",
  description:
    "Automate customer conversations, capture leads, and grow revenue with AI-powered WhatsApp & Instagram bots. Built for Indian businesses. Setup in 5 minutes.",
  alternates: {
    canonical: "https://ariesai.in",
  },
  openGraph: {
    title: "Aries AI - AI-Powered WhatsApp Automation",
    description:
      "Turn WhatsApp into your smartest revenue engine. AI-powered conversations that capture leads, follow up, and close deals — 24/7.",
    url: "https://ariesai.in",
    siteName: "Aries AI",
    locale: "en_IN",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Aries AI",
  url: "https://ariesai.in",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered WhatsApp automation platform for Indian businesses. Automate customer conversations, capture leads, and grow revenue 24/7.",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "INR",
    lowPrice: "999",
    highPrice: "6999",
    offerCount: "4",
  },
  creator: {
    "@type": "Organization",
    name: "Aries AI",
    url: "https://ariesai.in",
    logo: "https://ariesai.in/logo.png",
    sameAs: [],
  },
  featureList: [
    "WhatsApp Business API Integration",
    "AI Chatbot with Hindi/English/Hinglish support",
    "Automated Lead Capture",
    "Smart Follow-ups",
    "Google Sheets Sync",
    "Broadcast Campaigns",
    "Instagram DM Automation",
    "AI Voice Calling",
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageClient />
    </>
  );
}
