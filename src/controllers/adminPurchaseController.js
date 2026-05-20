'use strict';
const svc = require('../services/adminPurchaseService');

const getAllPurchases    = async (req, res, next) => { try { const result = await svc.getAllPurchases(req.query);    res.status(200).json({ status: 'success', data: result }); } catch (e) { next(e); } };
const getPurchaseById   = async (req, res, next) => { try { const p = await svc.getPurchaseById(req.params.purchaseId); res.status(200).json({ status: 'success', data: { purchase: p } }); } catch (e) { next(e); } };
const getPurchasesByUser= async (req, res, next) => { try { const r = await svc.getPurchasesByUser(req.params.userId, req.query); res.status(200).json({ status: 'success', data: r }); } catch (e) { next(e); } };
const getPurchaseStats  = async (req, res, next) => { try { const s = await svc.getPurchaseStats(req.query.from_date, req.query.to_date); res.status(200).json({ status: 'success', data: { stats: s } }); } catch (e) { next(e); } };
const processRefund     = async (req, res, next) => { try { const r = await svc.processRefund(req.params.purchaseId, req.body.reason); res.status(200).json({ status: 'success', message: 'Purchase refunded and cards revoked.', data: { purchase: r } }); } catch (e) { next(e); } };
const grantCards        = async (req, res, next) => { try { const r = await svc.grantCardsToUser(req.body); res.status(201).json({ status: 'success', message: `${r.cards_granted} card(s) granted to user.`, data: r }); } catch (e) { next(e); } };
const getUserDeckAdmin  = async (req, res, next) => { try { const c = await svc.getUserDeckAdmin(req.params.userId, req.query.status); res.status(200).json({ status: 'success', data: { cards: c, total: c.length } }); } catch (e) { next(e); } };
const revokeCard        = async (req, res, next) => { try { const c = await svc.revokeCard(req.params.userId, req.params.deckCardId, req.body.reason); res.status(200).json({ status: 'success', message: 'Card revoked from user deck.', data: { card: c } }); } catch (e) { next(e); } };
const getStoreProducts  = async (req, res, next) => { try { const p = await svc.getStoreProducts(); res.status(200).json({ status: 'success', data: { products: p } }); } catch (e) { next(e); } };
const createStoreProduct= async (req, res, next) => { try { const p = await svc.createStoreProduct(req.body); res.status(201).json({ status: 'success', data: { product: p } }); } catch (e) { next(e); } };
const updateStoreProduct= async (req, res, next) => { try { const p = await svc.updateStoreProduct(req.params.id, req.body); res.status(200).json({ status: 'success', data: { product: p } }); } catch (e) { next(e); } };
const deleteStoreProduct= async (req, res, next) => { try { const p = await svc.deleteStoreProduct(req.params.id); res.status(200).json({ status: 'success', message: 'Store product deleted.', data: { product: p } }); } catch (e) { next(e); } };

module.exports = { getAllPurchases, getPurchaseById, getPurchasesByUser, getPurchaseStats, processRefund, grantCards, getUserDeckAdmin, revokeCard, getStoreProducts, createStoreProduct, updateStoreProduct, deleteStoreProduct };
