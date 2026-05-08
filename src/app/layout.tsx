import type { Metadata } from "next";
import { Syne, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aries AI - AI-Powered WhatsApp Automation",
  description: "Automate customer conversations, capture leads, and grow revenue with AI-powered WhatsApp & Instagram bots. Built for Indian businesses on the official Meta WhatsApp Cloud API.",
  keywords: ["WhatsApp automation India", "Aries AI", "AI chatbot India", "WhatsApp business automation", "lead generation India", "WhatsApp API", "ariesai.in"],
  verification: {
    google: "google412dea1a2f069bcb",
  },
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
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <body style={{ fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>{children}</body>
    </html>
  );
}
