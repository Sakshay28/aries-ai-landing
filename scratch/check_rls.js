const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying RLS policies from pg_policies...');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename IN ('messages', 'conversations');
    `
  });
  
  if (error) {
    // If exec_sql RPC is not available, let's query via another method if possible, or print standard warning.
    console.error('exec_sql not available to query policies:', error);
    
    // Let's do a select using anon key to see if we can read the messages!
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwODgzOTAsImV4cCI6MjA5MzY2NDM5MH0.zBvsu19z6Wpru7LKM9lHyFiiICXp2wK6tyj0LTOK588';
    const anonClient = createClient(supabaseUrl, anonKey);
    
    console.log('Testing SELECT on conversations using anon client...');
    const { data: convs, error: convsErr } = await anonClient
      .from('conversations')
      .select('id')
      .limit(5);
    console.log('Convs select result:', convs, 'Error:', convsErr);
    
    console.log('Testing SELECT on messages using anon client...');
    const { data: msgs, error: msgsErr } = await anonClient
      .from('messages')
      .select('id')
      .limit(5);
    console.log('Msgs select result:', msgs, 'Error:', msgsErr);
    
  } else {
    console.log('RLS Policies:', data);
  }
}

main();
