const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qnzgvzlhirflmvtspnrh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuemd2emxoaXJmbG12dHNwbnJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA4ODM5MCwiZXhwIjoyMDkzNjY0MzkwfQ.drYyUOSCTHjTYTuPu75Ww8giba1xvuXZJVOfC4SeOHQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying schema info for table messages...');
  const { data, error } = await supabase.rpc('get_table_schema_info', { table_name: 'messages' });
  if (error) {
    console.log('get_table_schema_info rpc not available, executing fallback query...');
    // Since rpc might not exist, let's fetch constraints using a custom query if possible or just log it
    // Wait, let's write a postgres function or check if we can run sql using a temporary function
    const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='messages';
      `
    });
    if (sqlError) {
      console.error('SQL execution failed:', sqlError);
    } else {
      console.log('Foreign key constraints:', sqlData);
    }
  } else {
    console.log('Schema info:', data);
  }
}

main();
