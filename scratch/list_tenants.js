const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, business_name, business_email, wa_phone_number_id, wa_business_account_id, wa_webhook_verified');
    
  if (error) {
    console.error('Error fetching tenants:', error);
  } else {
    console.log('All tenants in database:');
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
