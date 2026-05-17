import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';
// 'unsafe-eval' is required by Next.js + Turbopack + React HMR in development
// for source-map reconstruction and hot updates. It is NEVER set in production.
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com https://checkout.razorpay.com https://connect.facebook.net`;

const csp = [
  "default-src 'self'",
  scriptSrc,
  "connect-src 'self' https://api.razorpay.com https://*.supabase.co wss://*.supabase.co wss://* https://graph.facebook.com https://www.facebook.com",
  "frame-src 'self' https://js.stripe.com https://checkout.razorpay.com https://www.facebook.com",
  "img-src 'self' data: https: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
].join('; ') + ';';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: csp },
      ],
    }];
  },
};

export default nextConfig;
