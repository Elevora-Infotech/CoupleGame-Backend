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

/**
 * @route POST /api/v1/admin/dashboard/categories
 * @route PUT /api/v1/admin/dashboard/categories/:id
 * @route DELETE /api/v1/admin/dashboard/categories/:id
 * @desc Admin Card Categories CRUD
 * @access Private (Admin Only)
 */
router.post('/dashboard/categories', adminProtect, adminController.createCardCategory);
router.put('/dashboard/categories/:id', adminProtect, adminController.updateCardCategory);
router.delete('/dashboard/categories/:id', adminProtect, adminController.deleteCardCategory);

/**
 * @route POST /api/v1/admin/dashboard/cards
 * @route PUT /api/v1/admin/dashboard/cards/:id
 * @route DELETE /api/v1/admin/dashboard/cards/:id
 * @desc Admin Cards CRUD
 * @access Private (Admin Only)
 */
router.post('/dashboard/cards', adminProtect, adminController.createCard);
router.put('/dashboard/cards/:id', adminProtect, adminController.updateCard);
router.delete('/dashboard/cards/:id', adminProtect, adminController.deleteCard);

module.exports = router;
