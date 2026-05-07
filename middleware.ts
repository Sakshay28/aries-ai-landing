export { proxy as middleware } from './src/proxy';

export const config = {
  matcher: [
    // Brand detection on root (Libra rewrite)
    '/',
    // Auth-protected routes
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/signup',
  ],
};
