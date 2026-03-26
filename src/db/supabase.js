const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

// Initialize Supabase client using Service Role key for backend operations (bypasses RLS)
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = { supabase };
