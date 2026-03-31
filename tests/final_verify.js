const { createClient } = require('@supabase/supabase-js');
const { env } = require('../src/config/env');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function finalVerify() {
  console.log('--- 🔍 FINAL DATABASE VERIFICATION ---');
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, otp_attempts')
    .eq('email', 'hacker_test@example.com')
    .single();
  
  if (error) {
    console.log('❌ ERROR: Test user not found!', error.message);
  } else {
    console.log('✅ SUCCESS: Test user persistent in database!');
    console.log(`👤 User: ${user.name}`);
    console.log(`🔑 OTP Attempts Tracked: ${user.otp_attempts}`);
  }
}

finalVerify();
