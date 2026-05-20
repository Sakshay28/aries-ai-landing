const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const msgId = '4674d501-e815-408d-bb85-e4edb9039e78';
  console.log(`Querying message details for ID: ${msgId}`);
  
  const { data, error } = await supabase
    .from('messages')
    .select('id, tenant_id, conversation_id, direction, content')
    .eq('id', msgId)
    .single();
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Message details:', data);
  }
}

main();
