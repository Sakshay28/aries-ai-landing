import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com wss://*; frame-src 'self' https://js.stripe.com https://checkout.razorpay.com; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;" },
      ],
    }];
  },
  async rewrites() {
    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    return [
      {
        source: '/admin/queue/:path*',
        destination: `${workerUrl}/admin/queue/:path*`, // Proxy to Bull-Board worker
      },
      {
        source: '/admin/queue',
        destination: `${workerUrl}/admin/queue`, // Handle the base route
      }
    ];
  },
};

// Only wrap with Sentry when SENTRY_AUTH_TOKEN is available (prevents build failures)
const finalConfig = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG || "aries-ai",
      project: process.env.SENTRY_PROJECT || "aries-libra-platform",
      silent: !process.env.CI,
      widenClientFileUpload: true,
    })
  : nextConfig;

export default finalConfig;
