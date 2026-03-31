const { supabase } = require('../db/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Handle Admin Login
 */
const adminLogin = async ({ email, password }) => {
  // Find admin by email
  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !admin) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  // Compare Password
  const isMatch = await bcrypt.compare(password, admin.password_hash);
  if (!isMatch) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  // Update Last Login
  await supabase
    .from('admins')
    .update({ last_login: new Date().toISOString() })
    .eq('id', admin.id);

  // Generate Admin Access Token
  const adminAccessToken = jwt.sign(
    { id: admin.id, role: admin.role, type: 'admin' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '2h' } // Admins get longer sessions
  );

  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    },
    token: adminAccessToken
  };
};

module.exports = {
  adminLogin
};
