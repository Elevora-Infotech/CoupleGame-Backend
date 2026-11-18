'use strict';

/**
 * @file   adminIntelligenceController.js
 * @desc   Controller for Intelligence Architecture (Parts C1-C8)
 */

const adminIntelligenceService = require('../services/adminIntelligenceService');

const getSmartDeckAudit = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const result = await adminIntelligenceService.getSmartDeckAudit(roomId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getRelationshipDynamics = async (req, res, next) => {
  try {
    const { roomId } = req.query;
    const result = await adminIntelligenceService.getRelationshipDynamics(roomId);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getBehavioralScoring = async (req, res, next) => {
  try {
    const result = await adminIntelligenceService.getBehavioralScoring();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getRiskDetectionFlags = async (req, res, next) => {
  try {
    const result = await adminIntelligenceService.getRiskDetectionFlags();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getFeedbackAnalytics = async (req, res, next) => {
  try {
    const result = await adminIntelligenceService.getFeedbackAnalytics();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getABTestExperiments = async (req, res, next) => {
  try {
    const result = await adminIntelligenceService.getABTestExperiments();
    res.status(200).json({ status: 'success', data: { experiments: result } });
  } catch (err) {
    next(err);
  }
};

const createABTestExperiment = async (req, res, next) => {
  try {
    const { name, description, test_type, variants, reason } = req.body;
    const result = await adminIntelligenceService.createABTestExperiment({
      name,
      description,
      test_type,
      variants,
      reason,
      admin: req.admin,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getDropoffAnalysis = async (req, res, next) => {
  try {
    const result = await adminIntelligenceService.getDropoffAnalysis();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSmartDeckAudit,
  getRelationshipDynamics,
  getBehavioralScoring,
  getRiskDetectionFlags,
  getFeedbackAnalytics,
  getABTestExperiments,
  createABTestExperiment,
  getDropoffAnalysis,
};
