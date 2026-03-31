const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route GET /api/v1/profile/me
 * @desc Get current user's profile
 * @access Private
 */
router.get('/me', authenticate, profileController.getMe);

/**
 * @route PATCH /api/v1/profile/me
 * @desc Update current user's profile
 * @access Private
 */
router.patch('/me', authenticate, profileController.updateMe);

module.exports = router;
