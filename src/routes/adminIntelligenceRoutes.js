'use strict';

/**
 * @file   adminIntelligenceRoutes.js
 * @desc   Routes for Intelligence Architecture (Parts C1-C8)
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminIntelligenceController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

router.use(adminProtect);

// C1: Smart Deck 80/20 Audit (Read-Only)
router.get('/smart-deck/:roomId', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getSmartDeckAudit);

// C2: Relationship Dynamics
router.get('/relationship-dynamics', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getRelationshipDynamics);

// C3: Behavioral Scoring
router.get('/behavioral-scoring', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getBehavioralScoring);

// C4: Risk Detection
router.get('/risk-detection', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getRiskDetectionFlags);

// C5: Feedback Analytics
router.get('/feedback', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getFeedbackAnalytics);

// C7: A/B Testing
router.get('/ab-tests', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getABTestExperiments);
router.post('/ab-tests', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.createABTestExperiment);

// C8: Dropoff Analysis
router.get('/dropoff-analysis', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getDropoffAnalysis);

module.exports = router;
