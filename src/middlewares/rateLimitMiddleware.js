const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter for the entire API
 * Limits every IP to 100 requests every 15 minutes (or configurable via env)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

/**
 * Stricter limiter for sensitive Auth endpoints (Signup, Login, OTP)
 * Limits every IP to 20 requests every 15 minutes (or configurable via env)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.AUTH_LIMIT_MAX ? parseInt(process.env.AUTH_LIMIT_MAX) : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many attempts on authentication endpoints, please try again after 15 minutes'
  }
});

module.exports = {
  apiLimiter,
  authLimiter
};
