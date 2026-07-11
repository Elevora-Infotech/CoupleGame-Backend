'use strict';
const purchaseService = require('../services/purchaseService');

const verifyPurchase = async (req, res, next) => {
  try {
    const result = await purchaseService.processWebhookPurchase(req.body);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) { next(error); }
};

const getPurchaseHistory = async (req, res, next) => {
  try {
    const purchases = await purchaseService.getUserPurchaseHistory(req.user.id);
    res.status(200).json({ status: 'success', data: { purchases } });
  } catch (error) { next(error); }
};
const mockBypassPurchase = async (req, res, next) => {
  try {
    const { bundleId, planId } = req.body;
    const result = await purchaseService.mockBypassPurchase(req.user.id, bundleId, planId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) { next(error); }
};

module.exports = { verifyPurchase, getPurchaseHistory, mockBypassPurchase };
