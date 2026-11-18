'use strict';

/**
 * @file   adminRevenueController.js
 * @desc   Controller for Phase 4: Business, Subscriptions & Revenue Operations
 */

const adminRevenueService = require('../services/adminRevenueService');

const getSubscriptionsLedger = async (req, res, next) => {
  try {
    const { page, limit, status, platform, search } = req.query;
    const result = await adminRevenueService.getSubscriptionsLedger({
      page,
      limit,
      status,
      platform,
      search,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getRevenueMetrics = async (req, res, next) => {
  try {
    const { range } = req.query;
    const result = await adminRevenueService.getRevenueMetrics({ range });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getPaywallFunnelMetrics = async (req, res, next) => {
  try {
    const result = await adminRevenueService.getPaywallFunnelMetrics();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getMarketingROI = async (req, res, next) => {
  try {
    const result = await adminRevenueService.getMarketingROI();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const recordAdSpend = async (req, res, next) => {
  try {
    const { week_start_ist, week_end_ist, campaign_type, ad_angle, amount_inr, reason } = req.body;
    const result = await adminRevenueService.recordAdSpend({
      week_start_ist,
      week_end_ist,
      campaign_type,
      ad_angle,
      amount_inr,
      reason,
      admin: req.admin,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const processAdminRefund = async (req, res, next) => {
  try {
    const { purchaseId } = req.params;
    const { reason } = req.body;
    const result = await adminRevenueService.processAdminRefund({
      purchaseId,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const grantComplimentarySubscription = async (req, res, next) => {
  try {
    const { roomId, seasonNumber, durationDays, reason } = req.body;
    const result = await adminRevenueService.grantComplimentarySubscription({
      roomId,
      seasonNumber,
      durationDays,
      reason,
      admin: req.admin,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSubscriptionsLedger,
  getRevenueMetrics,
  getPaywallFunnelMetrics,
  getMarketingROI,
  recordAdSpend,
  processAdminRefund,
  grantComplimentarySubscription,
};
