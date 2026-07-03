const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const telemetryController = require('../controllers/telemetryController');

// All telemetry routes require a standard logged-in user
router.get('/ab-tests', protect, telemetryController.getActiveTests);
router.post('/events', protect, telemetryController.recordEvent);
router.post('/feedback', protect, telemetryController.submitFeedback);

module.exports = router;

