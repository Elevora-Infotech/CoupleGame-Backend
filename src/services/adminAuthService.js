'use strict';

const { supabase } = require('../db/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { getAllowedCategories } = require('../constants/adminPermissions');
const { maskEmail } = require('../utils/privacyMasker');
const { logAdminAction } = require('./adminAuditService');

// In-memory TTL cache for pending 2FA challenges
// Key: adminId, Value: { otp, tempToken, expiresAt, attempts, lastSentAt }
const twoFactorSessions = new Map();

// Periodic cleanup of expired 2FA challenges (every 5 minutes)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, session] of twoFactorSessions.entries()) {
    if (session.expiresAt < now) {
      twoFactorSessions.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

/**
 * Step 1: Handle Admin Login (Password check + Initiate 2FA)
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

  // Check if 2FA is globally enabled in game_settings (Default: OFF)
  let is2FAEnabled = false;
  try {
    const { data: settingRow } = await supabase
      .from('game_settings')
      .select('setting_value')
      .eq('setting_key', 'admin_2fa_enabled')
      .maybeSingle();

    if (settingRow && settingRow.setting_value !== null) {
      is2FAEnabled = settingRow.setting_value === true || settingRow.setting_value === 'true' || settingRow.setting_value === 1 || settingRow.setting_value === '1';
    }
  } catch (settingErr) {
    console.warn('[AdminAuthService] Could not read admin_2fa_enabled setting, defaulting to false:', settingErr.message);
  }

  // If 2FA is OFF (default), bypass OTP and log in directly
  if (!is2FAEnabled) {
    const role = (admin.role || 'support').toLowerCase();
    const permissions = getAllowedCategories(role);

    try {
      await supabase
        .from('admins')
        .update({
          last_login: new Date().toISOString(),
        })
        .eq('id', admin.id);
    } catch (e) {}

    const adminAccessToken = jwt.sign(
      {
        id: admin.id,
        role: role,
        permissions: permissions,
        type: 'admin',
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '8h' }
    );

    return {
      requires2FA: false,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: role,
        permissions: permissions,
      },
      token: adminAccessToken,
    };
  }

  // Generate 6-digit numeric OTP (Only if 2FA is enabled)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Generate short-lived tempToken scoped specifically to 2FA verification
  const tempToken = jwt.sign(
    { id: admin.id, type: 'admin_2fa_pending' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' }
  );

  // Store in 2FA session cache
  twoFactorSessions.set(admin.id, {
    adminId: admin.id,
    otp,
    tempToken,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
  });

  // Attempt to persist to database if columns exist (fail-safe)
  try {
    await supabase
      .from('admins')
      .update({
        two_factor_code: otp,
        two_factor_expires_at: new Date(expiresAt).toISOString(),
        two_factor_attempts: 0,
      })
      .eq('id', admin.id);
  } catch (dbErr) {
    // If column doesn't exist, in-memory cache handles it seamlessly
  }

  // Dispatch OTP to admin email or local console
  console.log(`\n======================================================`);
  console.log(`🔐 [ADMIN 2FA CHALLENGE]`);
  console.log(`👤 Admin: ${admin.name} (${admin.email})`);
  console.log(`🔑 6-Digit Verification Code: ${otp}`);
  console.log(`⏳ Valid for: 10 minutes`);
  console.log(`======================================================\n`);

  return {
    requires2FA: true,
    tempToken,
    emailMasked: maskEmail(admin.email),
    message: 'Verification code generated. Please enter the 6-digit code to complete login.',
  };
};

/**
 * Step 2: Verify 2FA OTP Code
 */
const verify2FA = async ({ tempToken, otp }) => {
  if (!tempToken || !otp) {
    const err = new Error('Both tempToken and 6-digit OTP code are required.');
    err.status = 400;
    throw err;
  }

  // Verify temp token
  let decoded;
  try {
    decoded = jwt.verify(tempToken, env.JWT_ACCESS_SECRET);
    if (decoded.type !== 'admin_2fa_pending') {
      const err = new Error('Invalid token type.');
      err.status = 401;
      throw err;
    }
  } catch (jwtErr) {
    const err = new Error('Verification session expired or invalid. Please sign in again.');
    err.status = 401;
    throw err;
  }

  const adminId = decoded.id;
  const session = twoFactorSessions.get(adminId);

  // Check existence and expiry
  if (!session || session.expiresAt < Date.now()) {
    twoFactorSessions.delete(adminId);
    const err = new Error('Verification code has expired. Please request a new code or sign in again.');
    err.status = 400;
    throw err;
  }

  // Brute-force check: max 5 attempts
  if (session.attempts >= 5) {
    twoFactorSessions.delete(adminId);
    const err = new Error('Too many failed verification attempts. Please sign in again.');
    err.status = 429;
    throw err;
  }

  // Validate OTP code
  const cleanInput = String(otp).trim();
  if (cleanInput !== session.otp) {
    session.attempts += 1;
    const remaining = 5 - session.attempts;
    const err = new Error(`Incorrect verification code. ${remaining} attempts remaining.`);
    err.status = 400;
    throw err;
  }

  // OTP is correct! Fetch full admin details
  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, name, email, role')
    .eq('id', adminId)
    .single();

  if (error || !admin) {
    const err = new Error('Admin account not found.');
    err.status = 404;
    throw err;
  }

  // Invalidate 2FA challenge
  twoFactorSessions.delete(adminId);

  // Update Last Login in DB
  await supabase
    .from('admins')
    .update({
      last_login: new Date().toISOString(),
      two_factor_code: null,
      two_factor_expires_at: null,
    })
    .eq('id', admin.id);

  const role = (admin.role || 'support').toLowerCase();
  const permissions = getAllowedCategories(role);

  // Record audit log for login
  try {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: role,
      actionType: 'ADMIN_LOGIN_SUCCESS',
      targetEntity: 'admin_session',
      targetId: admin.id,
      reason: 'Two-step verification completed successfully',
    });
  } catch (auditErr) {
    console.warn('[AdminAuthService] Non-critical audit log error:', auditErr.message);
  }

  // Generate official Admin Access Token
  const adminAccessToken = jwt.sign(
    {
      id: admin.id,
      role: role,
      permissions: permissions,
      type: 'admin',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '8h' } // 8 hour session
  );

  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: role,
      permissions: permissions,
    },
    token: adminAccessToken,
  };
};

/**
 * Resend 2FA OTP code
 */
const resend2FA = async ({ tempToken }) => {
  if (!tempToken) {
    const err = new Error('Temporary verification token is required.');
    err.status = 400;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, env.JWT_ACCESS_SECRET);
  } catch (jwtErr) {
    const err = new Error('Session expired. Please sign in again.');
    err.status = 401;
    throw err;
  }

  const adminId = decoded.id;
  const session = twoFactorSessions.get(adminId);

  // Rate limit: 30 seconds cooldown between resends
  if (session && Date.now() - session.lastSentAt < 30 * 1000) {
    const waitSec = Math.ceil((30 * 1000 - (Date.now() - session.lastSentAt)) / 1000);
    const err = new Error(`Please wait ${waitSec} seconds before requesting a new code.`);
    err.status = 429;
    throw err;
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, name, email')
    .eq('id', adminId)
    .single();

  if (!admin) {
    const err = new Error('Admin not found.');
    err.status = 404;
    throw err;
  }

  const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  twoFactorSessions.set(adminId, {
    adminId,
    otp: newOtp,
    tempToken,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
  });

  console.log(`\n======================================================`);
  console.log(`🔄 [ADMIN 2FA RESEND]`);
  console.log(`👤 Admin: ${admin.name} (${admin.email})`);
  console.log(`🔑 New 6-Digit Code: ${newOtp}`);
  console.log(`======================================================\n`);

  return {
    success: true,
    message: 'New verification code dispatched.',
    emailMasked: maskEmail(admin.email),
  };
};

module.exports = {
  adminLogin,
  verify2FA,
  resend2FA,
};
