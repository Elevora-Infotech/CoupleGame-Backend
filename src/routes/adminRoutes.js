const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminProtect } = require('../middlewares/adminMiddleware');

/**
 * @route GET /api/v1/admin/dashboard/stats
 * @desc Get high-level system stats
 * @access Private (Admin Only)
 */
router.get('/dashboard/stats', adminProtect, adminController.getDashboardStats);

/**
 * @route POST /api/v1/admin/dashboard/questions
 * @desc Create a new question + options
 * @access Private (Admin Only)
 */
router.post('/dashboard/questions', adminProtect, adminController.createNewQuestion);

module.exports = router;
