import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

import { supabaseAdmin } from './lib/supabase/admin';

const CONV_ID = '45a55b61-d4c0-44d5-8d55-9a60673eb3f2';

async function run() {
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('context')
    .eq('id', CONV_ID)
    .single();

  const ctx = (conv?.context as any) || {};
  
  // Keep system context but reset all booking data
  const freshCtx = {
    wa_name: ctx.wa_name,
    language: ctx.language,
    wa_phone: ctx.wa_phone,
    guest_name: ctx.guest_name,
    tenant_name: ctx.tenant_name,
    current_date: ctx.current_date,
    current_time: ctx.current_time,
    conversation_id: ctx.conversation_id,
    // booking_saved intentionally NOT included = fresh start
  };

  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ context: freshCtx, current_step: 'greeting' })
    .eq('id', CONV_ID);

  console.log(error ? '❌ ERROR: ' + error.message : '✅ Conversation context reset — ready for fresh booking');
  console.log('New context:', JSON.stringify(freshCtx, null, 2));
}

run().catch(console.error);
