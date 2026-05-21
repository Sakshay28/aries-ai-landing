const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching last 15 messages across all conversations...');
  const { data: messages, error } = await supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      content,
      direction,
      status,
      created_at,
      tenant_id
    `)
    .order('created_at', { ascending: false })
    .limit(15);
    
  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }
  
  console.log('Recent Messages:');
  messages.forEach(msg => {
    console.log(`[${msg.created_at}] [Tenant: ${msg.tenant_id}] [Conv: ${msg.conversation_id}] [Dir: ${msg.direction}] [Status: ${msg.status}]`);
    console.log(`  Content: "${msg.content}"`);
  });
}

main();
