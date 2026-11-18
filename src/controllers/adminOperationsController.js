'use strict';

const svc = require('../services/adminOperationsService');
const { sendSuccess, sendError } = require('../utils/response');

const search = async (req, res, next) => {
  try {
    const results = await svc.unifiedSearch(req.query.q);
    res.status(200).json({ status: 'success', data: results });
  } catch (e) { next(e); }
};

const getCouple = async (req, res, next) => {
  try {
    const result = await svc.getCoupleDetail(req.params.roomId);
    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

const addNote = async (req, res, next) => {
  try {
    const { reason_tag, note_text } = req.body;
    const result = await svc.addSupportNote({
      roomId: req.params.roomId,
      authorId: req.admin?.id || '00000000-0000-0000-0000-000000000000',
      authorName: req.admin?.name || 'Support Agent',
      reasonTag: reason_tag,
      noteText: note_text,
    });
    res.status(201).json({ status: 'success', message: 'Support note added.', data: result });
  } catch (e) { next(e); }
};

const resendInvite = async (req, res, next) => {
  try {
    const result = await svc.resendInviteLink(req.params.roomId);
    res.status(200).json({ status: 'success', message: result.message, data: result });
  } catch (e) { next(e); }
};

const restoreCard = async (req, res, next) => {
  try {
    const { card_send_id, reason } = req.body;
    const result = await svc.restoreCard({
      roomId: req.params.roomId,
      cardSendId: card_send_id,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', message: result.message, data: result.card });
  } catch (e) { next(e); }
};

const extendTimer = async (req, res, next) => {
  try {
    const { card_send_id, hours, reason } = req.body;
    const result = await svc.extendTimer({
      roomId: req.params.roomId,
      cardSendId: card_send_id,
      hours: Number(hours) || 24,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', message: result.message, data: result });
  } catch (e) { next(e); }
};

const pauseTimers = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await svc.pauseAllTimers({ reason, admin: req.admin });
    res.status(200).json({ status: 'success', message: result.message, data: result.control });
  } catch (e) { next(e); }
};

const resumeTimers = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await svc.resumeAllTimers({ reason, admin: req.admin });
    res.status(200).json({ status: 'success', message: result.message, data: result.control });
  } catch (e) { next(e); }
};

const getControls = async (req, res, next) => {
  try {
    const result = await svc.getAppControls();
    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

const updateControl = async (req, res, next) => {
  try {
    const { key, value, reason } = req.body;
    const result = await svc.updateAppControlSetting({
      key,
      value,
      reason,
      admin: req.admin,
    });
    res.status(200).json({ status: 'success', message: result.message, data: result });
  } catch (e) { next(e); }
};

module.exports = {
  search,
  getCouple,
  addNote,
  resendInvite,
  restoreCard,
  extendTimer,
  pauseTimers,
  resumeTimers,
  getControls,
  updateControl,
};
