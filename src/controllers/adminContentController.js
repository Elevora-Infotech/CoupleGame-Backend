'use strict';

/**
 * @file   adminContentController.js
 * @desc   Controller for Content Management (Cards, Categories, Bundles)
 */

const adminContentService = require('../services/adminContentService');

const getCardsCatalog = async (req, res, next) => {
  try {
    const { page, limit, categoryId, cardType, spiceLevel, status, search } = req.query;
    const result = await adminContentService.getCardsCatalog({
      page,
      limit,
      categoryId,
      cardType,
      spiceLevel,
      status,
      search,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getCardById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminContentService.getCardById(id);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const createCard = async (req, res, next) => {
  try {
    const { name, prompt, categoryId, cardType, spiceLevel, timerHours, penaltyPrompt, reason } = req.body;
    const result = await adminContentService.createCard({
      name,
      prompt,
      categoryId,
      cardType,
      spiceLevel,
      timerHours,
      penaltyPrompt,
      admin: req.admin,
      reason,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const updateCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, prompt, categoryId, spiceLevel, timerHours, penaltyPrompt, isActive, reason } = req.body;
    const result = await adminContentService.updateCard({
      cardId: id,
      name,
      prompt,
      categoryId,
      spiceLevel,
      timerHours,
      penaltyPrompt,
      isActive,
      admin: req.admin,
      reason,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const toggleCardStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    const result = await adminContentService.toggleCardStatus({
      cardId: id,
      isActive,
      admin: req.admin,
      reason,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const result = await adminContentService.getCategories();
    res.status(200).json({ status: 'success', data: { categories: result } });
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, themeColor, description, isActive, reason } = req.body;
    const result = await adminContentService.updateCategory({
      categoryId: id,
      name,
      themeColor,
      description,
      isActive,
      admin: req.admin,
      reason,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const getContentVersionDiffs = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const result = await adminContentService.getContentVersionDiffs({ limit: Number(limit) || 50 });
    res.status(200).json({ status: 'success', data: { diffs: result } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCardsCatalog,
  getCardById,
  createCard,
  updateCard,
  toggleCardStatus,
  getCategories,
  updateCategory,
  getContentVersionDiffs,
};
