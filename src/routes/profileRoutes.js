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
/**
 * @route GET /api/v1/profile/relationship-stats
 * @desc Get current user's relationship stats (Anniversary, time together)
 * @access Private
 */
router.get('/relationship-stats', authenticate, profileController.getRelationshipStats);

module.exports = router;
