'use strict';

/**
 * @file   plansRoutes.js
 * @desc   Public API for fetching active VIP Membership plans & feature comparison table
 */

const express = require('express');
const router = express.Router();
const { getMembershipPlansAndFeatures } = require('../services/adminSettingsService');

/**
 * @route   GET /api/v1/plans/membership
 * @desc    Fetch active membership plans and comparison features dynamically
 * @access  Public
 */
router.get('/membership', async (req, res, next) => {
  try {
    const data = await getMembershipPlansAndFeatures();
    
    // Client safety rule: Filter out disabled plans so mobile only renders enabled ones
    const activePlans = {};
    if (data.plans) {
      Object.entries(data.plans).forEach(([key, plan]) => {
        if (plan && plan.enabled) {
          activePlans[key] = plan;
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        all_plans: data.plans,
        active_plans: activePlans,
        features: data.features,
        updated_at_ist: data.updated_at_ist,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
