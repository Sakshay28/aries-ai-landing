import { headers } from "next/headers";
import LoginClient from "./LoginClient";

// middleware.ts forwards the verified session's email here (never redirects
// away from /login anymore) so the client can show an "already signed in"
// banner instead of silently bouncing to /dashboard.
export default async function LoginPage() {
  const headerStore = await headers();
  const alreadySignedInEmail = headerStore.get("x-verified-user-email") || undefined;

  return <LoginClient alreadySignedInEmail={alreadySignedInEmail} />;
}
