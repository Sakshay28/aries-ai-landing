#!/usr/bin/env node
// Merge Globesome tenants:
//   1. Fix owner email: globesome.tag@gmail.com → globesome.tage@gmail.com (auth + users table)
//   2. Delete empty Globesomeindia tenant (eeb0ad9a) and its owner

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const KEEP_TENANT_ID   = 'e29f53cf-4855-4571-93f4-9abd2cc116bd'; // Globesome India — has all data
const DELETE_TENANT_ID = 'eeb0ad9a-2251-46c8-9ef2-0dddbe17bbfc'; // Globesomeindia — empty
const OLD_EMAIL = 'globesome.tag@gmail.com';
const NEW_EMAIL = 'globesome.tage@gmail.com';

async function main() {
  console.log('── Step 1: Fix owner email ─────────────────────────────────');

  // Find the user record in public.users
  const { data: pubUser, error: pubErr } = await sb
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', KEEP_TENANT_ID)
    .eq('email', OLD_EMAIL)
    .single();

  if (pubErr || !pubUser) {
    console.error('❌ Could not find user in public.users:', pubErr?.message);
    process.exit(1);
  }
  console.log(`   Found public.users: ${pubUser.id} (${pubUser.email}, ${pubUser.role})`);

  // Update public.users email
  const { error: pubUpdateErr } = await sb
    .from('users')
    .update({ email: NEW_EMAIL })
    .eq('id', pubUser.id);

  if (pubUpdateErr) {
    console.error('❌ public.users update failed:', pubUpdateErr.message);
    process.exit(1);
  }
  console.log(`   ✅ public.users email updated → ${NEW_EMAIL}`);

  // Update Supabase auth email via admin API
  const { data: authUser, error: authLookupErr } = await sb.auth.admin.getUserById(pubUser.id);
  if (authLookupErr || !authUser?.user) {
    console.warn(`   ⚠️  Auth user lookup failed (may not exist in auth): ${authLookupErr?.message}`);
    console.warn('   → Continuing (public.users is what the app uses for auth checks)');
  } else {
    console.log(`   Found auth.users: ${authUser.user.id} (${authUser.user.email})`);
    const { error: authUpdateErr } = await sb.auth.admin.updateUserById(pubUser.id, {
      email: NEW_EMAIL,
      email_confirm: true,
    });
    if (authUpdateErr) {
      console.warn(`   ⚠️  Auth email update failed: ${authUpdateErr.message}`);
      console.warn('   → public.users email is fixed; auth email may need manual update in Supabase dashboard');
    } else {
      console.log(`   ✅ auth.users email updated → ${NEW_EMAIL}`);
    }
  }

  console.log('\n── Step 2: Delete empty Globesomeindia tenant ──────────────');

  // Verify it's still empty before deleting
  const { count: leadCount } = await sb.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', DELETE_TENANT_ID);
  const { count: convCount  } = await sb.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', DELETE_TENANT_ID);
  console.log(`   Leads: ${leadCount}, Conversations: ${convCount}`);

  if (leadCount > 0 || convCount > 0) {
    console.error('❌ Tenant is NOT empty — aborting delete for safety');
    process.exit(1);
  }

  // Delete the user in the empty tenant first
  const { data: emptyTenantUsers } = await sb.from('users').select('id, email').eq('tenant_id', DELETE_TENANT_ID);
  for (const u of emptyTenantUsers ?? []) {
    const { error: delUserErr } = await sb.from('users').delete().eq('id', u.id);
    if (delUserErr) console.warn(`   ⚠️  Could not delete user ${u.email}:`, delUserErr.message);
    else console.log(`   ✅ Deleted user: ${u.email}`);

    // Also remove from auth
    const { error: delAuthErr } = await sb.auth.admin.deleteUser(u.id);
    if (delAuthErr) console.warn(`   ⚠️  Auth delete for ${u.email}:`, delAuthErr.message);
    else console.log(`   ✅ Deleted auth user: ${u.email}`);
  }

  // Delete the tenant itself
  const { error: delTenantErr } = await sb.from('tenants').delete().eq('id', DELETE_TENANT_ID);
  if (delTenantErr) {
    console.error('❌ Tenant delete failed:', delTenantErr.message);
    process.exit(1);
  }
  console.log(`   ✅ Deleted tenant: Globesomeindia (${DELETE_TENANT_ID})`);

  console.log('\n── Result ───────────────────────────────────────────────────');
  console.log(`   Surviving tenant : Globesome India (${KEEP_TENANT_ID})`);
  console.log(`   Owner email      : ${NEW_EMAIL}`);
  console.log(`   Deleted tenant   : Globesomeindia (${DELETE_TENANT_ID})`);
  console.log('   ✅ Done\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
