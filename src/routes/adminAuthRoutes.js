'use strict';

const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

/**
 * @route POST /api/v1/admin/auth/login
 * @desc  Admin Login Step 1 (Password validation & OTP initiation)
 * @access Public
 */
router.post('/login', adminAuthController.login);

/**
 * @route POST /api/v1/admin/auth/verify-2fa
 * @desc  Admin Login Step 2 (Verify OTP code & grant access token)
 * @access Public (Requires valid tempToken)
 */
router.post('/verify-2fa', adminAuthController.verify2FA);

/**
 * @route POST /api/v1/admin/auth/resend-2fa
 * @desc  Resend 6-digit OTP code
 * @access Public (Requires valid tempToken)
 */
router.post('/resend-2fa', adminAuthController.resend2FA);

module.exports = router;
