require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await s.from('bundle_plans').select('*').limit(1);
  if (error) { console.error('ERROR:', error); return; }
  console.log('\n=== bundle_plans columns ===');
  if (data && data[0]) console.log(Object.keys(data[0]));
  else console.log('No rows found');

  // Also test the exact join used in purchaseService
  const { data: d2, error: e2 } = await s
    .from('store_products')
    .select('plan_id, bundle_plans(id, card_count, amount_paid, bundle_id)')
    .eq('is_active', true)
    .limit(1);
  console.log('\n=== Join test (amount_paid) ===');
  console.log(JSON.stringify({ data: d2, error: e2 }, null, 2));

  // Try with price instead
  const { data: d3, error: e3 } = await s
    .from('store_products')
    .select('plan_id, bundle_plans(id, card_count, price, bundle_id)')
    .eq('is_active', true)
    .limit(1);
  console.log('\n=== Join test (price) ===');
  console.log(JSON.stringify({ data: d3, error: e3 }, null, 2));
}
check();
