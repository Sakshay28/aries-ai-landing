import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aries AI - AI-Powered WhatsApp Automation",
  description: "Automate customer conversations, capture leads, and grow revenue with AI-powered WhatsApp bots. Trusted by businesses across India for WhatsApp API automation.",
  keywords: ["WhatsApp automation India", "Aries AI", "AI chatbot India", "WhatsApp business automation", "lead generation India", "WhatsApp API", "ariesai.in"],
  openGraph: {
    title: "Aries AI - AI-Powered WhatsApp Automation",
    description: "Turn WhatsApp into your smartest revenue engine. AI-powered conversations that capture leads, follow up, and close deals — 24/7.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
