require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s
    .from('store_products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { console.error('ERROR:', error); return; }
  console.log('\n=== Last 10 store_products rows ===');
  console.log(JSON.stringify(data, null, 2));
}
check();
