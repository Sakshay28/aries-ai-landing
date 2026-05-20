const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const convId = 'f68e574b-2884-4842-b6b2-fd04f8921a6d';
  console.log(`Checking conversation details for ID: ${convId}`);
  
  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', convId)
    .single();
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Conversation Details:', conv);
  }
}

main();
