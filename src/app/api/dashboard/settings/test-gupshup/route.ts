import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/gupshup/service';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, phoneNumber, appName } = await req.json();

    if (!apiKey || !phoneNumber || !appName) {
      return NextResponse.json(
        { success: false, error: 'API Key, Phone Number and App Name are required' },
        { status: 400 }
      );
    }

    const result = await testConnection(apiKey, phoneNumber, appName);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
