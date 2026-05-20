const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log(`Checking publication tables...`);
  
  const channel = supabase
    .channel('db-test-pub')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      console.log('Change received!!!:', payload);
    })
    .subscribe(async (status) => {
      console.log('Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('Inserting test message to trigger realtime...');
        const { data, error } = await supabase
          .from('messages')
          .insert({
            tenant_id: '0c828ce2-8614-40e5-b5ed-6895d93a3328',
            conversation_id: 'f68e574b-2884-4842-b6b2-fd04f8921a6d',
            direction: 'outbound',
            content: 'Realtime test message ' + Date.now(),
            channel: 'whatsapp',
            status: 'sent'
          })
          .select();
        if (error) {
          console.error('Insert error:', error);
        } else {
          console.log('Test message inserted successfully:', data);
        }
      }
    });

  // Keep script alive for 10 seconds to wait for realtime events
  setTimeout(() => {
    console.log('Done waiting.');
    process.exit(0);
  }, 10000);
}

main();
