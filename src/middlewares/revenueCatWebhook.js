/**
 * @file   revenueCatWebhook.js
 * @desc   Middleware that validates incoming RevenueCat webhook requests.
 *
 * RevenueCat sends a shared secret in the Authorization header.
 * You set this secret in: RevenueCat Dashboard → Project → Webhooks → Secret
 * Then add it to your .env as REVENUECAT_WEBHOOK_SECRET.
 *
 * Security: If the secret is missing or wrong → 401. Backend never processes
 * a fake webhook and never allocates cards fraudulently.
 */

'use strict';

const validateRevenueCatWebhook = (req, res, next) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[RevenueCat] REVENUECAT_WEBHOOK_SECRET not set in environment.');
    return res.status(500).json({ status: 'error', message: 'Webhook secret not configured.' });
  }

  // RevenueCat sends the secret as a plain Bearer token
  const authHeader = req.headers['authorization'] || '';
  const incoming   = authHeader.replace('Bearer ', '').trim();

  if (!incoming || incoming !== secret) {
    console.warn('[RevenueCat] Invalid webhook secret received.');
    return res.status(401).json({ status: 'error', message: 'Unauthorized webhook.' });
  }

  next();
};

module.exports = { validateRevenueCatWebhook };
