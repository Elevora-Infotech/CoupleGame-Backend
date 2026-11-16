'use strict';

const adminAuthService = require('../services/adminAuthService');

/**
 * Step 1: Admin Login Controller
 * Authenticates email + password, issues temporary token and dispatches 6-digit OTP
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      const err = new Error('Email and password are required.');
      err.status = 400;
      throw err;
    }

    const result = await adminAuthService.adminLogin({ email, password });

    res.status(200).json({
      status: 'success',
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Step 2: 2FA Verification Controller
 * Validates 6-digit OTP code, issues full 8-hour admin JWT session
 */
const verify2FA = async (req, res, next) => {
  try {
    const { tempToken, otp } = req.body;

    if (!tempToken || !otp) {
      const err = new Error('Both tempToken and 6-digit verification code are required.');
      err.status = 400;
      throw err;
    }

    const { admin, token } = await adminAuthService.verify2FA({ tempToken, otp });

    res.status(200).json({
      status: 'success',
      message: 'Two-step verification successful. Access granted.',
      data: {
        admin,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend 2FA verification code
 */
const resend2FA = async (req, res, next) => {
  try {
    const { tempToken } = req.body;

    if (!tempToken) {
      const err = new Error('Temporary verification token is required.');
      err.status = 400;
      throw err;
    }

    const result = await adminAuthService.resend2FA({ tempToken });

    res.status(200).json({
      status: 'success',
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  verify2FA,
  resend2FA,
};
