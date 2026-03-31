const { createClient } = require('@supabase/supabase-js');
const { env } = require('../src/config/env');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function probeTable() {
  console.log('--- 🔍 DATABASE PROBE STARTING ---');
  const { data, error } = await supabase.from('users').select('id').limit(1);
  
  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('relation "public.users" does not exist')) {
      console.log('❌ DATABASE ERROR: The "users" table does not exist in Supabase!');
      console.log('👉 ACTION REQUIRED: You must run the SQL script in your Supabase Dashboard.');
    } else {
      console.log('❌ UNKNOWN DB ERROR:', error.message);
    }
  } else {
    console.log('✅ SUCCESS: "users" table found and reachable!');
  }
}

probeTable();
