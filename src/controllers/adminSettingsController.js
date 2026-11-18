'use strict';

/**
 * @file   adminSettingsController.js
 * @desc   Phase 6: Controller for Dynamic Settings, Free Pool, Controls & Soft Launch
 */

const adminSettingsService = require('../services/adminSettingsService');
const adminOperationsService = require('../services/adminOperationsService');

// 1. Runtime Game Parameters
const getRuntimeSettings = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getRuntimeSettings();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const updateRuntimeSettings = async (req, res, next) => {
  try {
    const { settings, reason } = req.body;
    const result = await adminSettingsService.updateRuntimeSettings({
      settings,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// 2. Free-Pool Manager
const getFreePoolStatus = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getFreePoolStatus();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const setCardFreePoolStatus = async (req, res, next) => {
  try {
    const { cardId, isFreePool, reason } = req.body;
    const result = await adminSettingsService.setCardFreePoolStatus({
      cardId,
      isFreePool,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const seedFreePoolDefaults = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await adminSettingsService.seedFreePoolDefaults({
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// 3. App Controls, Banners & Emergency Outage Controls
const getAppControls = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getAppControls();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const updateAppControlSetting = async (req, res, next) => {
  try {
    const { key, value, reason } = req.body;
    const result = await adminSettingsService.updateAppControlSetting({
      key,
      value,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const pauseAllTimers = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await adminOperationsService.pauseAllTimers({
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const resumeAllTimers = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await adminOperationsService.resumeAllTimers({
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// 4. End-of-Free-Game Pitch
const getFreeGamePitch = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getFreeGamePitch();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const updateFreeGamePitch = async (req, res, next) => {
  try {
    const { pitch, reason } = req.body;
    const result = await adminSettingsService.updateFreeGamePitch({
      pitch,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// 5. Soft-Launch Decision Engine
const getSoftLaunchMetrics = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getSoftLaunchMetrics();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// 6. VIP Membership Plans & Features
const getMembershipPlans = async (req, res, next) => {
  try {
    const result = await adminSettingsService.getMembershipPlansAndFeatures();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const updateMembershipPlans = async (req, res, next) => {
  try {
    const { plans, features, reason } = req.body;
    const result = await adminSettingsService.updateMembershipPlansAndFeatures({
      plans,
      features,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRuntimeSettings,
  updateRuntimeSettings,
  getFreePoolStatus,
  setCardFreePoolStatus,
  seedFreePoolDefaults,
  getAppControls,
  updateAppControlSetting,
  pauseAllTimers,
  resumeAllTimers,
  getFreeGamePitch,
  updateFreeGamePitch,
  getSoftLaunchMetrics,
  getMembershipPlans,
  updateMembershipPlans,
};
