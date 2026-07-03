const { supabase } = require('../db/supabase');
const adminService = require('../services/adminService');

/**
 * Assigns user to active A/B tests and returns their configurations
 */
const getActiveTests = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Fetch all ACTIVE tests
    const { data: activeTests, error: testsErr } = await supabase
      .from('ab_tests')
      .select('id, name, test_type')
      .eq('status', 'ACTIVE');
      
    if (testsErr) throw testsErr;
    if (!activeTests || activeTests.length === 0) {
      return res.status(200).json({ status: 'success', data: [] });
    }

    // 2. Fetch user's current assignments
    const { data: assignments, error: assignErr } = await supabase
      .from('ab_test_assignments')
      .select('test_id, variant_id, ab_test_variants(variant_name, config_json)')
      .eq('user_id', userId);
      
    if (assignErr) throw assignErr;

    const assignedTestIds = assignments?.map(a => a.test_id) || [];
    const results = [];

    // 3. Process each active test
    for (const test of activeTests) {
      if (assignedTestIds.includes(test.id)) {
        // User is already assigned to this test, return their variant config
        const assignment = assignments.find(a => a.test_id === test.id);
        results.push({
          test_name: test.name,
          test_type: test.test_type,
          variant: assignment.ab_test_variants.variant_name,
          config: assignment.ab_test_variants.config_json
        });
      } else {
        // User needs to be assigned to a variant
        const { data: variants, error: varErr } = await supabase
          .from('ab_test_variants')
          .select('id, variant_name, config_json, traffic_allocation_percent')
          .eq('test_id', test.id);

        if (varErr || !variants || variants.length === 0) continue;

        // Simple random assignment based on traffic allocation
        const rand = Math.random() * 100;
        let cumulative = 0;
        let selectedVariant = variants[variants.length - 1]; // Default to last

        for (const variant of variants) {
          cumulative += variant.traffic_allocation_percent;
          if (rand <= cumulative) {
            selectedVariant = variant;
            break;
          }
        }

        // Save assignment to database
        await supabase
          .from('ab_test_assignments')
          .insert([{
            test_id: test.id,
            user_id: userId,
            variant_id: selectedVariant.id
          }]);

        results.push({
          test_name: test.name,
          test_type: test.test_type,
          variant: selectedVariant.variant_name,
          config: selectedVariant.config_json
        });
      }
    }

    res.status(200).json({ status: 'success', data: results });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a telemetry event or conversion
 */
const recordEvent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { event_name, metadata = {} } = req.body;

    if (!event_name) {
      return res.status(400).json({ status: 'error', message: 'event_name is required' });
    }

    // 1. Insert telemetry event
    const { error: eventErr } = await supabase
      .from('app_events')
      .insert([{
        user_id: userId,
        event_name: event_name,
        event_metadata: metadata
      }]);
      
    if (eventErr) throw eventErr;

    res.status(200).json({ status: 'success', message: 'Event recorded successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit user feedback from Mobile App
 */
const submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { feedback_type, rating, message, metadata } = req.body;

    const result = await adminService.submitFeedback({
      user_id: userId,
      feedback_type,
      rating,
      message,
      metadata
    });

    res.status(201).json({
      status: 'success',
      message: 'Feedback submitted successfully. Thank you!',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveTests,
  recordEvent,
  submitFeedback
};
