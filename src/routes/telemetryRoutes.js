const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const telemetryController = require('../controllers/telemetryController');

// All telemetry routes require a standard logged-in user
router.get('/ab-tests', authenticate, telemetryController.getActiveTests);
router.post('/events', authenticate, telemetryController.recordEvent);
router.post('/feedback', authenticate, telemetryController.submitFeedback);

module.exports = router;

