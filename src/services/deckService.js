'use strict';

/**
 * @file   deckService.js
 * @desc   User card deck management + Card Game Engine.
 *
 * CARD GAME ENGINE RULES:
 *  - Sender can send max 3 cards per day (resets midnight UTC)
 *  - Sender can have max 2 active (non-terminal) cards at once
 *  - Receiver has 24h to respond — then card moves to WAITING
 *  - 48h total no action — PENALTY triggered
 *  - Receiver can: Accept → In Progress → Mark Complete → Sender Confirms
 *  - Receiver can Deflect to close without penalty
 *  - Penalty system design is deferred — status tracked only for now
 */

const { supabase } = require('../db/supabase');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// Terminal statuses — a card in these states does NOT count toward active limit
const TERMINAL = ['COMPLETED', 'DEFLECTED', 'PENALTY'];

// ─────────────────────────────────────────────────────────────
// Get User's Full Deck (all visible cards)
// ─────────────────────────────────────────────────────────────
const getUserDeck = async (userId) => {
  const { data, error } = await supabase
    .from('v_user_deck_detail')
    .select('*')
    .eq('user_id', userId)
    .eq('is_visible', true)
    .order('acquired_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

// ─────────────────────────────────────────────────────────────
// Get Available Cards for the CURRENT Room (Option B)
// ─────────────────────────────────────────────────────────────
const getAvailableCards = async (userId, roomId) => {
  if (!roomId) throwError('room_id is required to fetch available cards.', 400);

  const { data, error } = await supabase
    .from('v_user_deck_detail')
    .select('*')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('is_used', false)
    .eq('expired', false)
    .eq('is_visible', true)
    .order('acquired_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

// ─────────────────────────────────────────────────────────────
// Play a Card in a Room (mark as used, no send)
// ─────────────────────────────────────────────────────────────
const playCard = async (userId, deckCardId, roomId) => {
  const { data: card, error: fetchErr } = await supabase
    .from('user_card_deck')
    .select('id, user_id, is_used, expired')
    .eq('id', deckCardId)
    .single();

  if (fetchErr || !card) throwError('Card not found in your deck.', 404);
  if (card.user_id !== userId) throwError('This card does not belong to you.', 403);
  if (card.is_used)            throwError('This card has already been played.', 409);
  if (card.expired)            throwError('This card has expired.', 410);

  const { data: updated, error: updateErr } = await supabase
    .from('user_card_deck')
    .update({ is_used: true, room_id: roomId, used_at: new Date().toISOString() })
    .eq('id', deckCardId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateErr) throwError('Failed to play card.', 500);
  return updated;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — HELPER: Check daily send limit
// Max 3 sends per day per user. Resets at midnight UTC.
// ─────────────────────────────────────────────────────────────
const checkDailySendLimit = async (userId) => {
  const todayMidnightUTC = new Date();
  todayMidnightUTC.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .gte('sent_at', todayMidnightUTC.toISOString());

  if (error) throwError('Failed to check daily limit.', 500);
  return count || 0;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — HELPER: Check active card limit
// Max 2 active (non-terminal) sends per user.
// ─────────────────────────────────────────────────────────────
const checkActiveSendLimit = async (userId) => {
  const { count, error } = await supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .not('status', 'in', `(${TERMINAL.join(',')})`);

  if (error) throwError('Failed to check active card limit.', 500);
  return count || 0;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — HELPER: Lazily update overdue statuses
// Called on card fetch — if deadline has passed, update status.
// Avoids needing a background cron job.
// ─────────────────────────────────────────────────────────────
const resolveOverdueStatuses = async (userId) => {
  const now = new Date().toISOString();

  // SENT → WAITING (respond_deadline passed)
  await supabase
    .from('room_card_sends')
    .update({ status: 'WAITING' })
    .eq('sender_id', userId)
    .eq('status', 'SENT')
    .lt('respond_deadline', now);

  // SENT/WAITING → PENALTY (penalty_deadline passed)
  await supabase
    .from('room_card_sends')
    .update({ status: 'PENALTY', penalty_triggered_at: now })
    .eq('sender_id', userId)
    .in('status', ['SENT', 'WAITING'])
    .lt('penalty_deadline', now);
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Send a Card to Partner
//
// Validates:
//  - Daily limit (max 3 per day)
//  - Active limit (max 2 active at once)
//  - Card belongs to sender and is unused/unexpired
//  - Receiver is in the same room
//  - Message is ≤ 200 chars
// Then marks card as used and creates the send record.
// ─────────────────────────────────────────────────────────────
const sendCard = async (senderId, deckCardId, roomId, receiverId, message) => {
  if (message && message.length > 200) {
    throwError('Message must be 200 characters or less.', 400);
  }

  // Lazily resolve any overdue statuses before checking limits
  await resolveOverdueStatuses(senderId);

  // Check daily limit
  const todayCount = await checkDailySendLimit(senderId);
  if (todayCount >= 3) {
    throwError('Daily limit reached. You can send a maximum of 3 cards per day. Resets at midnight UTC.', 429);
  }

  // Check active limit
  const activeCount = await checkActiveSendLimit(senderId);
  if (activeCount >= 2) {
    throwError('You already have 2 active cards. Finish or close one before sending another.', 429);
  }

  // Validate deck card
  const { data: card, error: fetchErr } = await supabase
    .from('user_card_deck')
    .select('id, user_id, card_id, is_used, expired, room_id')
    .eq('id', deckCardId)
    .single();

  if (fetchErr || !card) throwError('Card not found in your deck.', 404);
  if (card.user_id !== senderId) throwError('This card does not belong to you.', 403);
  if (card.is_used)              throwError('This card has already been used or sent.', 409);
  if (card.expired)              throwError('This card has expired.', 410);

  // Verify receiver is in the same room
  const { data: roomMember } = await supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', receiverId)
    .single();

  if (!roomMember) throwError('Receiver is not in this room.', 400);

  // Mark deck card as used
  const { error: useErr } = await supabase
    .from('user_card_deck')
    .update({ is_used: true, room_id: roomId, used_at: new Date().toISOString() })
    .eq('id', deckCardId)
    .eq('user_id', senderId);

  if (useErr) throwError('Failed to mark card as used.', 500);

  // Compute deadlines
  const sentAt = new Date();
  const respondDeadline = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000); // +24h
  const penaltyDeadline = new Date(sentAt.getTime() + 48 * 60 * 60 * 1000); // +48h

  // Create the send record
  const { data: sendRecord, error: sendErr } = await supabase
    .from('room_card_sends')
    .insert([{
      room_id:          roomId,
      sender_id:        senderId,
      receiver_id:      receiverId,
      deck_card_id:     deckCardId,
      card_id:          card.card_id,
      message:          message || null,
      status:           'SENT',
      respond_deadline: respondDeadline.toISOString(),
      penalty_deadline: penaltyDeadline.toISOString(),
    }])
    .select(`
      id, room_id, sender_id, receiver_id, message, sent_at, status,
      respond_deadline, penalty_deadline,
      cards ( id, name, power_description, card_type,
              card_categories ( name, theme_color ) )
    `)
    .single();

  if (sendErr) throwError(`Failed to create card send record: ${sendErr.message}`, 500);
  return sendRecord;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Accept a Card (Receiver)
// SENT/WAITING → IN_PROGRESS
// Receiver also has a max 2 active cards limit (cards IN_PROGRESS they received)
// ─────────────────────────────────────────────────────────────
const acceptCard = async (receiverId, sendId) => {
  // Check receiver's own active accepted cards
  const { count } = await supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', receiverId)
    .eq('status', 'IN_PROGRESS');

  if ((count || 0) >= 2) {
    throwError('You already have 2 active cards in progress. Complete or close one first.', 429);
  }

  const { data, error } = await supabase
    .from('room_card_sends')
    .update({ status: 'IN_PROGRESS', accepted_at: new Date().toISOString() })
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .in('status', ['SENT', 'WAITING'])  // can only accept if not yet terminal
    .select(`
      id, room_id, sender_id, receiver_id, status, accepted_at, message,
      cards ( id, name, power_description, card_type )
    `)
    .single();

  if (error || !data) throwError('Send record not found, already actioned, or not yours to accept.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Deflect a Card (Receiver)
// SENT/WAITING/IN_PROGRESS → DEFLECTED
// No penalty for the receiver.
// ─────────────────────────────────────────────────────────────
const deflectCard = async (receiverId, sendId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({ status: 'DEFLECTED', deflected_at: new Date().toISOString() })
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .not('status', 'in', '(COMPLETED,DEFLECTED,PENALTY)')
    .select('id, room_id, sender_id, receiver_id, status, deflected_at')
    .single();

  if (error || !data) throwError('Card not found or cannot be deflected in its current state.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Mark Complete (Receiver)
// IN_PROGRESS → COMPLETED_BY_RECEIVER
// Sender must then confirm.
// ─────────────────────────────────────────────────────────────
const markCardComplete = async (receiverId, sendId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({
      status:                  'COMPLETED_BY_RECEIVER',
      completed_by_receiver_at: new Date().toISOString(),
    })
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .eq('status', 'IN_PROGRESS')
    .select('id, room_id, sender_id, receiver_id, status, completed_by_receiver_at')
    .single();

  if (error || !data) throwError('Card not found or not in progress.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Confirm Completion (Sender)
// COMPLETED_BY_RECEIVER → COMPLETED ✅
// ─────────────────────────────────────────────────────────────
const confirmCardComplete = async (senderId, sendId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({ status: 'COMPLETED', confirmed_at: new Date().toISOString() })
    .eq('id', sendId)
    .eq('sender_id', senderId)
    .eq('status', 'COMPLETED_BY_RECEIVER')
    .select('id, room_id, sender_id, receiver_id, status, confirmed_at')
    .single();

  if (error || !data) throwError('Card not found or receiver has not marked it complete yet.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Send Reminder (Receiver → Sender)
// Receiver nudges sender to confirm completion.
// Rate-limited: can only remind once every 6h.
// ─────────────────────────────────────────────────────────────
const sendReminder = async (receiverId, sendId) => {
  // Fetch current record
  const { data: existing, error: fetchErr } = await supabase
    .from('room_card_sends')
    .select('id, room_id, sender_id, receiver_id, status, reminder_sent_at')
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .eq('status', 'COMPLETED_BY_RECEIVER')
    .single();

  if (fetchErr || !existing) throwError('Card not found or not awaiting confirmation.', 404);

  // Rate limit: 6h between reminders
  if (existing.reminder_sent_at) {
    const lastReminder = new Date(existing.reminder_sent_at).getTime();
    const sixHoursMs   = 6 * 60 * 60 * 1000;
    if (Date.now() - lastReminder < sixHoursMs) {
      throwError('You already sent a reminder recently. Wait at least 6 hours before sending another.', 429);
    }
  }

  await supabase
    .from('room_card_sends')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', sendId);

  return existing;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Mark as Seen (Receiver opens card)
// ─────────────────────────────────────────────────────────────
const markCardSeen = async (receiverId, sendId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({ is_seen: true, seen_at: new Date().toISOString() })
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .select()
    .single();

  if (error || !data) throwError('Send record not found or not yours.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Get Card Send History for a Room
// ─────────────────────────────────────────────────────────────
const getCardSendHistory = async (userId, roomId) => {
  await resolveOverdueStatuses(userId); // lazily update before returning

  const { data, error } = await supabase
    .from('room_card_sends')
    .select(`
      id, room_id, sender_id, receiver_id, message, status, is_seen,
      sent_at, accepted_at, deflected_at, completed_by_receiver_at,
      confirmed_at, penalty_triggered_at, reminder_sent_at, seen_at,
      respond_deadline, penalty_deadline,
      cards ( id, name, power_description, card_type,
              card_categories ( name, theme_color ) )
    `)
    .eq('room_id', roomId)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('sent_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Get Daily Limits for a User
// Returns how many cards sent today and how many active.
// Frontend uses this to decide whether to show/disable the send button.
// ─────────────────────────────────────────────────────────────
const getSendLimits = async (userId) => {
  await resolveOverdueStatuses(userId);
  const todayCount  = await checkDailySendLimit(userId);
  const activeCount = await checkActiveSendLimit(userId);
  return {
    daily_sent:       todayCount,
    daily_limit:      3,
    daily_remaining:  Math.max(0, 3 - todayCount),
    active_count:     activeCount,
    active_limit:     2,
    active_remaining: Math.max(0, 2 - activeCount),
    can_send:         todayCount < 3 && activeCount < 2,
  };
};

module.exports = {
  getUserDeck,
  getAvailableCards,
  playCard,
  sendCard,
  acceptCard,
  deflectCard,
  markCardComplete,
  confirmCardComplete,
  sendReminder,
  markCardSeen,
  getCardSendHistory,
  getSendLimits,
};
