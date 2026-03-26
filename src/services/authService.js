const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');
const userModel = require('../models/userModel');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendResetOtpEmail } = require('../utils/mailer');

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/**
 * Handle user signup
 */
const signup = async ({ name, email, password }) => {
  // Check if user already exists
  const existingUser = await userModel.findUserByEmail(email);
  if (existingUser) {
    const error = new Error('Email is already in use');
    error.status = 409;
    throw error;
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  // Create user
  const newUser = await userModel.createUser({
    name,
    email,
    password_hash,
    auth_provider: 'email',
  });

  // Generate tokens
  const accessToken = generateAccessToken(newUser.id);
  const refreshToken = generateRefreshToken(newUser.id);

  // Save refresh token in DB
  await userModel.updateUser(newUser.id, { refresh_token: refreshToken });

  // Remove sensitive fields before returning
  delete newUser.password_hash;
  delete newUser.refresh_token;

  return { user: newUser, accessToken, refreshToken };
};

/**
 * Handle user login
 */
const login = async ({ email, password }) => {
  const user = await userModel.findUserByEmail(email);
  if (!user) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // Ensure they used the correct provider
  if (user.auth_provider !== 'email') {
    const error = new Error('Please login using your authentication provider');
    error.status = 400;
    throw error;
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Save refresh token in DB
  await userModel.updateUser(user.id, { refresh_token: refreshToken });

  delete user.password_hash;
  delete user.refresh_token;

  return { user, accessToken, refreshToken };
};

/**
 * Handle Google Login via ID Token
 */
const googleLogin = async ({ token }) => {
  // Verify Google ID token
  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { email, name } = payload;

  // Check if user exists
  let user = await userModel.findUserByEmail(email);

  if (!user) {
    // Create new user using Google details
    user = await userModel.createUser({
      name,
      email,
      password_hash: null, // No password for OAuth users
      auth_provider: 'google'
    });
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await userModel.updateUser(user.id, { refresh_token: refreshToken });

  delete user.password_hash;
  delete user.refresh_token;

  return { user, accessToken, refreshToken };
};

/**
 * Handle generating a new Access Token from a valid Refresh Token
 */
const refresh = async ({ refreshToken }) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    const error = new Error('Invalid or expired refresh token. Please login again.');
    error.status = 401;
    throw error;
  }

  const user = await userModel.findUserById(decoded.id);

  // Security check: ensure the refresh token matches the one in DB
  if (!user || user.refresh_token !== refreshToken) {
    const error = new Error('Invalid refresh token or logged out.');
    error.status = 401;
    throw error;
  }

  // Generate new rotated tokens
  const newAccessToken = generateAccessToken(user.id);
  const newRefreshToken = generateRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/**
 * Handle Forgot Password (Sends a 6-digit OTP)
 */
const forgotPassword = async ({ email }) => {
  const user = await userModel.findUserByEmail(email);
  if (!user || user.auth_provider === 'google') {
    // Return success to prevent email enumeration
    return { message: 'If an account exists, you will receive an OTP shortly.' };
  }

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Set expiry to 1 hour
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1);

  await userModel.updateUser(user.id, { 
    reset_token: otp, 
    reset_token_expiry: expiry.toISOString(),
    otp_attempts: 0 // Reset attempts on new request
  });

  // Send the real email (or log to console if not configured)
  await sendResetOtpEmail(email, otp);

  return { message: 'If an account exists, you will receive an OTP shortly.' };
};

/**
 * Verify OTP (with Brute-Force protection)
 */
const verifyOtp = async ({ email, otp }) => {
  const user = await userModel.findUserByEmail(email);
  
  if (!user) {
    const error = new Error('Invalid or expired OTP.');
    error.status = 400;
    throw error;
  }

  // Pentest Fix: Prevent brute-force on 6-digit OTP
  if (user.otp_attempts >= 5) {
    const error = new Error('Too many failed attempts. Please request a new OTP.');
    error.status = 429; // Too Many Requests
    throw error;
  }

  const isOtpValid = user.reset_token === otp && new Date(user.reset_token_expiry) > new Date();

  if (!isOtpValid) {
    // Increment failed attempts
    await userModel.updateUser(user.id, { 
      otp_attempts: (user.otp_attempts || 0) + 1 
    });

    const error = new Error('Invalid or expired OTP.');
    error.status = 400;
    throw error;
  }

  return { message: 'OTP verified successfully. You can now reset your password.' };
};

/**
 * Handle Reset Password (using OTP)
 */
const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await userModel.findUserByEmail(email);
  
  // Re-verify everything for final security
  if (!user || user.reset_token !== otp || new Date(user.reset_token_expiry) < new Date() || user.otp_attempts >= 5) {
    const error = new Error('Invalid request or expired OTP.');
    error.status = 400;
    throw error;
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);

  // Update DB and clear reset tokens + attempts
  await userModel.updateUser(user.id, {
    password_hash,
    reset_token: null,
    reset_token_expiry: null,
    otp_attempts: 0
  });

  return { message: 'Your password has been reset successfully.' };
};

module.exports = { 
  signup, 
  login,
  googleLogin,
  refresh,
  forgotPassword,
  verifyOtp,
  resetPassword
};
