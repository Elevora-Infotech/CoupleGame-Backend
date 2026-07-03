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
 * @route GET /api/v1/admin/dashboard/questions
 * @route POST /api/v1/admin/dashboard/questions
 * @route PUT /api/v1/admin/dashboard/questions/:id
 * @route DELETE /api/v1/admin/dashboard/questions/:id
 * @desc Admin Questionnaire CRUD
 * @access Private (Admin Only)
 */
router.get('/dashboard/questions', adminProtect, adminController.getAllQuestions);
router.post('/dashboard/questions', adminProtect, adminController.createNewQuestion);
router.put('/dashboard/questions/:id', adminProtect, adminController.updateQuestion);
router.delete('/dashboard/questions/:id', adminProtect, adminController.deleteQuestion);

/**
 * @route GET /api/v1/admin/dashboard/categories
 * @desc  Get all card categories (lightweight list for admin panel)
 * @access Private (Admin Only)
 */
router.get('/dashboard/categories', adminProtect, adminController.getAllCategories);
router.post('/dashboard/categories', adminProtect, adminController.createCardCategory);
router.put('/dashboard/categories/:id', adminProtect, adminController.updateCardCategory);
router.delete('/dashboard/categories/:id', adminProtect, adminController.deleteCardCategory);

/**
 * @route GET /api/v1/admin/dashboard/cards
 * @desc  Get all cards with category info (lightweight list for bundle card picker)
 * @access Private (Admin Only)
 */
router.get('/dashboard/cards/stats', adminProtect, adminController.getCardStats);
router.get('/dashboard/cards', adminProtect, adminController.getAllCards);
router.post('/dashboard/cards', adminProtect, adminController.createCard);
router.get('/dashboard/cards/:id', adminProtect, adminController.getCardById);
router.put('/dashboard/cards/:id', adminProtect, adminController.updateCard);
router.patch('/dashboard/cards/:id/toggle', adminProtect, adminController.toggleCardActive);
router.delete('/dashboard/cards/:id', adminProtect, adminController.deleteCard);

router.get('/dashboard/cards-analytics', adminProtect, adminController.getCardPerformanceAnalytics);
router.get('/dashboard/relationship-dynamics', adminProtect, adminController.getRelationshipDynamics);
router.get('/dashboard/growth-analytics', adminProtect, adminController.getGrowthAnalytics);
router.post('/dashboard/ab-tests', adminProtect, adminController.createABTest);

module.exports = router;
