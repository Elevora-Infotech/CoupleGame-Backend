const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');

/**
 * @route POST /api/v1/admin/auth/login
 * @desc Admin Login for the Dashboard
 * @access Public (Requires Admin Credentials)
 */
router.post('/login', adminAuthController.login);

module.exports = router;
