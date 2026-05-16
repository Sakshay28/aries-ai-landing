import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/gupshup/service';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, phoneNumber } = await req.json();

    if (!apiKey || !phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'API Key and Phone Number are required' },
        { status: 400 }
      );
    }

    const result = await testConnection(apiKey, phoneNumber);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
