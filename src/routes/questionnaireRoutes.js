const express = require('express');
const router = express.Router();
const questionnaireController = require('../controllers/questionnaireController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * @route GET /api/v1/questionnaire
 * @desc Get all questions & options
 * @access Private
 */
router.get('/', authenticate, questionnaireController.getQuestions);

/**
 * @route POST /api/v1/questionnaire/answers
 * @desc Submit/Update answers (Upsert)
 * @access Private
 */
router.post('/answers', authenticate, questionnaireController.submitAnswers);

/**
 * @route GET /api/v1/questionnaire/my-answers
 * @desc Get user's submitted answers
 * @access Private
 */
router.get('/my-answers', authenticate, questionnaireController.getMyAnswers);

module.exports = router;
