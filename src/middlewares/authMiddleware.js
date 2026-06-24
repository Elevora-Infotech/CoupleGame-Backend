const { verifyAccessToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');
const { supabase } = require('../db/supabase');

/**
 * Middleware to verify JWT Access Token AND enforce the is_blocked flag.
 *
 * Blocked users receive HTTP 403 on EVERY protected API call.
 * This silently logs them out on the frontend — the existing Axios
 * interceptor already treats non-401 failures as fatal, so no frontend
 * code changes are required.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication token missing or incorrectly formatted');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    return sendError(res, 401, 'Token is invalid or expired');
  }

  // ── Block Check ────────────────────────────────────────────
  // Lightweight single-column fetch — no joins, fast index scan.
  const { data: user, error } = await supabase
    .from('users')
    .select('is_blocked')
    .eq('id', decoded.id)
    .single();

  if (error || !user) {
    return sendError(res, 401, 'Account not found.');
  }

  if (user.is_blocked) {
    return sendError(res, 403, 'Your account has been suspended. Please contact support.');
  }
  // ──────────────────────────────────────────────────────────

  req.user = decoded;
  next();
};

module.exports = { 
  authenticate 
};
