// Ultra-lightweight keep-warm endpoint.
// Hits NO database, NO Redis — just proves the JS runtime is alive.
// External pingers (UptimeRobot, cron-job.org) should hit this every 5 min
// to prevent Vercel cold starts on the webhook.
export async function GET() {
  return new Response(JSON.stringify({ ok: true, t: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
