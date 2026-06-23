const { supabase } = require('../src/db/supabase');

async function check() {
  console.log('Checking room_card_sends table presence...');
  const { data, error } = await supabase
    .from('room_card_sends')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error checking room_card_sends table:', error.message);
    if (error.message.includes('does not exist')) {
      console.log('💡 Table does not exist. It needs to be created.');
    }
  } else {
    console.log('✅ Table room_card_sends exists! Found rows:', data.length);
  }
}

check();
