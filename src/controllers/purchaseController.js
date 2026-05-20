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

module.exports = { verifyPurchase, getPurchaseHistory };
