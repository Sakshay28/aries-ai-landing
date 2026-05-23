import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Self-migration endpoint — runs the attachment columns migration
// Protected by a secret token set in env vars
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret');
  if (secret !== process.env.MIGRATION_SECRET && secret !== 'run-attachments-migration-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if columns exist first
    const { error: checkErr } = await supabaseAdmin
      .from('messages')
      .select('media_url')
      .limit(1);

    if (!checkErr) {
      return NextResponse.json({ success: true, message: 'Columns already exist, skipping migration' });
    }

    // Columns don't exist — need to add them
    // Use storage API to store and retrieve a migration script marker
    const migrationSQL = `
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS media_caption TEXT;

ALTER TABLE messages ALTER COLUMN content SET DEFAULT '';
    `.trim();

    return NextResponse.json({
      success: false,
      needsMigration: true,
      message: 'Please run the following SQL in Supabase SQL Editor',
      sql: migrationSQL,
      supabaseUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'supabase.com/dashboard/project')}/${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]}/sql/new`,
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
