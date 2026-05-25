import type { Metadata } from "next";
import Script from "next/script";
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
  metadataBase: new URL("https://ariesai.in"),
  title: {
    default: "Aries AI - AI-Powered WhatsApp Automation for Indian Businesses",
    template: "%s | Aries AI",
  },
  description: "Automate customer conversations, capture leads, and grow revenue with AI-powered WhatsApp & Instagram bots. Built for Indian businesses on the official Meta WhatsApp Cloud API.",
  keywords: ["WhatsApp automation India", "Aries AI", "AI chatbot India", "WhatsApp business automation", "lead generation India", "WhatsApp API", "ariesai.in", "WhatsApp bot", "customer support automation", "AI chatbot for business"],
  authors: [{ name: "Aries AI", url: "https://ariesai.in" }],
  creator: "Aries AI",
  publisher: "Aries AI",
  verification: {
    google: "google412dea1a2f069bcb",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Aries AI - AI-Powered WhatsApp Automation",
    description: "Turn WhatsApp into your smartest revenue engine. AI-powered conversations that capture leads, follow up, and close deals — 24/7.",
    url: "https://ariesai.in",
    siteName: "Aries AI",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aries AI - AI-Powered WhatsApp Automation",
    description: "Turn WhatsApp into your smartest revenue engine. AI chatbot for Indian businesses.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <body className="transition-colors duration-500 ease-in-out" style={{ fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Script id="theme-init" strategy="beforeInteractive">{`try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(_){}`}</Script>
        {children}
      </body>
    </html>
  );
}
