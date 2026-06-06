// This diagnostic endpoint has been removed.
// It previously exposed integration tokens for all tenants — security issue.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
