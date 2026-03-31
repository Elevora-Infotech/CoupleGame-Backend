const { supabase } = require('../src/db/supabase');
const bcrypt = require('bcryptjs');

async function resetPasswords() {
  console.log('🚀 Resetting Test Account Passwords...');

  const salt = await bcrypt.genSalt(10);
  const userHash = await bcrypt.hash('securepassword123', salt);
  const adminHash = await bcrypt.hash('admin123', salt);

  // 1. Reset User Password
  const { error: uErr } = await supabase
    .from('users')
    .update({ password_hash: userHash })
    .eq('email', 'nikhilbhor201@gmail.com');

  if (uErr) console.error('User Reset Error:', uErr);
  else console.log('✅ User "nikhilbhor201@gmail.com" password reset to "securepassword123"');

  // 2. Reset Admin Password
  const { error: aErr } = await supabase
    .from('admins')
    .update({ password_hash: adminHash })
    .eq('email', 'admin@elevora.com');

  if (aErr) console.error('Admin Reset Error:', aErr);
  else console.log('✅ Admin "admin@elevora.com" password reset to "admin123"');

  process.exit(0);
}

resetPasswords();
