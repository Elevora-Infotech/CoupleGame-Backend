const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { supabase } = require('../db/supabase');

/**
 * Admin Middleware
 * 1. Verifies that the JWT is valid.
 * 2. Verifies that the user exists in the 'admins' table.
 */
const adminProtect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Decode the token
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

      // Verify it's an admin token (from our adminAuthService logic)
      if (decoded.type !== 'admin') {
        const error = new Error('Access denied. Not an admin.');
        error.status = 403;
        throw error;
      }

      // Final check: Does this admin ID still exist in our database?
      const { data: admin, error } = await supabase
        .from('admins')
        .select('id, name, email, role')
        .eq('id', decoded.id)
        .single();

      if (error || !admin) {
        const error = new Error('Unauthorized. Admin not found.');
        error.status = 401;
        throw error;
      }

      // Add admin and id to request object
      req.admin = admin;
      req.adminId = admin.id;

      next();
    } catch (error) {
      console.error('[AdminMiddleware] Error:', error.message);
      const err = new Error('Not authorized to access the Admin Dashboard.');
      err.status = 401;
      next(err);
    }
  } else {
    const error = new Error('No admin token provided.');
    error.status = 401;
    next(error);
  }
};

module.exports = { adminProtect };
