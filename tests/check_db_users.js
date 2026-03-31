const { supabase } = require('../src/db/supabase');

async function checkUsers() {
  console.log('--- Checking Users ---');
  const { data: users, error: uErr } = await supabase.from('users').select('id, email, name');
  if (uErr) console.error('User Error:', uErr);
  else console.log('Users:', users);

  console.log('\n--- Checking Admins ---');
  const { data: admins, error: aErr } = await supabase.from('admins').select('id, email, name');
  if (aErr) console.error('Admin Error:', aErr);
  else console.log('Admins:', admins);
}

checkUsers();
