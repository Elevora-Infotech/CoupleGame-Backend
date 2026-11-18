const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

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
router.post('/dashboard/questions', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.createNewQuestion);
router.put('/dashboard/questions/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.updateQuestion);
router.delete('/dashboard/questions/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.deleteQuestion);

/**
 * @route GET /api/v1/admin/dashboard/categories
 * @desc  Get all card categories (lightweight list for admin panel)
 * @access Private (Admin Only)
 */
router.get('/dashboard/categories', adminProtect, adminController.getAllCategories);
router.post('/dashboard/categories', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.createCardCategory);
router.put('/dashboard/categories/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.updateCardCategory);
router.delete('/dashboard/categories/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.deleteCardCategory);

/**
 * @route GET /api/v1/admin/dashboard/cards
 * @desc  Get all cards with category info (lightweight list for bundle card picker)
 * @access Private (Admin Only)
 */
router.get('/dashboard/cards/stats', adminProtect, adminController.getCardStats);
router.get('/dashboard/cards', adminProtect, adminController.getAllCards);
router.post('/dashboard/cards', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.createCard);
router.get('/dashboard/cards/:id', adminProtect, adminController.getCardById);
router.put('/dashboard/cards/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.updateCard);
router.patch('/dashboard/cards/:id/toggle', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.toggleCardActive);
router.delete('/dashboard/cards/:id', adminProtect, requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), adminController.deleteCard);

router.get('/dashboard/cards-analytics', adminProtect, adminController.getCardPerformanceAnalytics);
router.get('/dashboard/relationship-dynamics', adminProtect, adminController.getRelationshipDynamics);
router.get('/dashboard/growth-analytics', adminProtect, adminController.getGrowthAnalytics);
router.post('/dashboard/ab-tests', adminProtect, adminController.createABTest);

// Section 3 & 4: Intelligence Routes
router.get('/intelligence/behavioral-scores', adminProtect, adminController.getBehavioralScores);
router.get('/intelligence/smart-deck', adminProtect, adminController.getSmartDeckRecommendations);
router.get('/intelligence/risk-detection', adminProtect, adminController.getRiskDetection);
router.get('/intelligence/kpis', adminProtect, adminController.getBusinessKpis);
router.get('/intelligence/feedback', adminProtect, adminController.getAllFeedback);
router.patch('/intelligence/feedback/:id', adminProtect, adminController.updateFeedbackStatus);
router.get('/intelligence/card-versions', adminProtect, adminController.getCardVersionHistory);
router.get('/intelligence/insights', adminProtect, adminController.getInsightDashboard);

// Section 5: Team & Employee Management
router.get('/team', adminProtect, adminController.getTeamMembers);
router.post('/team', adminProtect, adminController.createTeamMember);
router.delete('/team/:id', adminProtect, adminController.deleteTeamMember);

module.exports = router;
