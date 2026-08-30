'use strict';
const { checkSendBan, resolvePendingPenalties, resolveLiftedBans } = require('./penaltyService');
const { createNotification } = require('./notificationService');

/**
 * @file   deckService.js
 * @desc   User card deck management + Card Game Engine.
 *
 * CARD GAME ENGINE RULES:
 *  - Sender can send max 2 cards per day (resets midnight UTC)
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
    .neq('category_name', 'Deflect Cards')
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
    .neq('category_name', 'Deflect Cards')
    .order('acquired_at', { ascending: false });

  if (error) throwError(error.message, 400);

  // Fetch penalty logs to identify which cards were acquired as penalty gifts
  const { data: penaltyGifts } = await supabase
    .from('penalty_log')
    .select('card_transferred_id')
    .eq('room_id', roomId)
    .not('card_transferred_id', 'is', null);

  const transferredCardIds = new Set(penaltyGifts?.map(p => p.card_transferred_id) || []);

  const modifiedData = data.map(card => {
    if (transferredCardIds.has(card.deck_card_id)) {
      return { ...card, category_name: 'Penalty Rewards' };
    }
    return card;
  });

  return modifiedData;
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
// Max 2 sends per day per user. Resets at midnight UTC.
// ─────────────────────────────────────────────────────────────
const checkDailySendLimit = async (userId, roomId) => {
  const todayMidnightUTC = new Date();
  todayMidnightUTC.setUTCHours(0, 0, 0, 0);

  let query = supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .gte('sent_at', todayMidnightUTC.toISOString());

  if (roomId) query = query.eq('room_id', roomId);

  const { count, error } = await query;

  if (error) throwError('Failed to check daily limit.', 500);
  return count || 0;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — HELPER: Check active card limit
// Max 2 active (non-terminal) sends per user.
// ─────────────────────────────────────────────────────────────
const checkActiveSendLimit = async (userId, roomId) => {
  let query = supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .not('status', 'in', `(${TERMINAL.join(',')})`);

  if (roomId) query = query.eq('room_id', roomId);

  const { count, error } = await query;

  if (error) throwError('Failed to check active card limit.', 500);
  return count || 0;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — HELPER: Lazily update overdue statuses
// Called on card fetch — if deadline has passed, update status.
// Avoids needing a background cron job.
// ─────────────────────────────────────────────────────────────
const resolveOverdueStatuses = async (userId, roomId = null) => {
  const now = new Date().toISOString();

  // SENT → WAITING (respond_deadline passed)
  let q1 = supabase
    .from('room_card_sends')
    .update({ status: 'WAITING' })
    .eq('sender_id', userId)
    .eq('status', 'SENT')
    .lt('respond_deadline', now);
  if (roomId) q1 = q1.eq('room_id', roomId);
  await q1;

  // SENT/WAITING → PENALTY (penalty_deadline passed)
  let q2 = supabase
    .from('room_card_sends')
    .update({ status: 'PENALTY', penalty_triggered_at: now })
    .eq('sender_id', userId)
    .in('status', ['SENT', 'WAITING'])
    .lt('penalty_deadline', now);
  if (roomId) q2 = q2.eq('room_id', roomId);
  await q2;

  // Lazily resolve any lifted bans and notify the user
  await resolveLiftedBans(userId);
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Send a Card to Partner
//
// Validates:
//  - Daily limit (max 2 per day)
//  - Active limit (max 2 active at once)
//  - Card belongs to sender and is unused/unexpired
//  - Receiver is in the same room
//  - Message is ≤ 200 chars
// Then marks card as used and creates the send record.
// ─────────────────────────────────────────────────────────────
const sendCard = async (senderId, deckCardId, roomId, receiverId, message) => {
  const t0 = performance.now();
  if (message && message.length > 200) {
    throwError('Message must be 200 characters or less.', 400);
  }

  // Non-blocking lazy cleanup for overdue statuses & lifted bans
  setImmediate(async () => {
    try {
      await resolveOverdueStatuses(senderId, roomId);
      await resolvePendingPenalties(senderId, roomId);
    } catch (e) {
      // background safety
    }
  });

  const t1 = performance.now();
  // Parallelize ALL safety & limit checks for ultra-fast validation (<150ms)
  const [banCheck, todayCount, activeCount, cardRes, roomRes] = await Promise.all([
    checkSendBan(senderId, roomId),
    checkDailySendLimit(senderId, roomId),
    checkActiveSendLimit(senderId, roomId),
    supabase
      .from('user_card_deck')
      .select('id, user_id, card_id, is_used, expired, room_id')
      .eq('id', deckCardId)
      .single(),
    supabase
      .from('rooms')
      .select('host_id, partner_id, status')
      .eq('id', roomId)
      .single()
  ]);
  const t2 = performance.now();
  console.log(`[PERF] sendCard validations (Promise.all) took: ${(t2 - t1).toFixed(2)} ms`);

  // Check if sender is currently banned (Penalty 2)
  if (banCheck.isBanned) {
    const until = new Date(banCheck.bannedUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    throwError(`Something was started but left unfinished. Sending is paused until ${until}.`, 403);
  }

  // Check daily limit for THIS room
  if (todayCount >= 2) {
    throwError('Daily limit reached. You can send a maximum of 2 cards per day. Resets at midnight UTC.', 429);
  }

  // Check active limit for THIS room
  if (activeCount >= 2) {
    throwError('You already have 2 active cards. Finish or close one before sending another.', 429);
  }

  // Validate deck card
  const { data: card, error: fetchErr } = cardRes;
  if (fetchErr || !card) throwError('Card not found in your deck.', 404);
  if (card.user_id !== senderId) throwError('This card does not belong to you.', 403);
  if (card.is_used)              throwError('This card has already been used or sent.', 409);
  if (card.expired)              throwError('This card has expired.', 410);

  // Validate room & participants
  const { data: room, error: roomErr } = roomRes;
  if (roomErr || !room) {
    throwError('Room not found.', 404);
  }

  const isSenderInRoom   = (room.host_id === senderId || room.partner_id === senderId);
  const isReceiverInRoom = (room.host_id === receiverId || room.partner_id === receiverId);

  if (!isSenderInRoom || !isReceiverInRoom) {
    throwError('Receiver is not in this room.', 400);
  }

  // Compute deadlines
  const sentAt = new Date();
  const respondDeadline = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000); // +24h
  const penaltyDeadline = new Date(sentAt.getTime() + 48 * 60 * 60 * 1000); // +48h

  const t3 = performance.now();
  // Mark deck card as used AND insert send record concurrently for minimum latency
  const [useRes, sendRes] = await Promise.all([
    supabase
      .from('user_card_deck')
      .update({ is_used: true, room_id: roomId, used_at: sentAt.toISOString() })
      .eq('id', deckCardId)
      .eq('user_id', senderId),
    supabase
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
      .single()
  ]);
  const t4 = performance.now();
  console.log(`[PERF] sendCard writes (Promise.all) took: ${(t4 - t3).toFixed(2)} ms`);

  if (useRes.error) throwError('Failed to mark card as used.', 500);
  if (sendRes.error) throwError(`Failed to create card send record: ${sendRes.error.message}`, 500);

  const sendRecord = sendRes.data;

  // ── Notify receiver in background (non-blocking) ─────────────────
  const cardName = sendRecord.cards?.name || 'a card';
  createNotification(
    receiverId,
    'CARD_RECEIVED',
    '💫 You received a card!',
    `Your partner sent you "${cardName}". Tap to view and respond.`,
    { send_id: sendRecord.id, card_id: sendRecord.cards?.id, room_id: roomId }
  ).catch(() => {});

  const t5 = performance.now();
  console.log(`[PERF] sendCard total time: ${(t5 - t0).toFixed(2)} ms`);

  return sendRecord;
};

// ─────────────────────────────────────────────────────────────
// CARD GAME ENGINE — Accept a Card (Receiver)
// SENT/WAITING → IN_PROGRESS
// Receiver also has a max 2 active cards limit (cards IN_PROGRESS they received)
// ─────────────────────────────────────────────────────────────
const acceptCard = async (receiverId, sendId) => {
  // First fetch the exact current status of the card to give a specific error if it fails
  const { data: existingCard, error: fetchErr } = await supabase
    .from('room_card_sends')
    .select('status, receiver_id')
    .eq('id', sendId)
    .single();

  if (fetchErr || !existingCard) {
    throwError('Card not found.', 404);
  }

  if (existingCard.receiver_id !== receiverId) {
    throwError('This card was not sent to you.', 403);
  }

  // Handle specific statuses with clear errors to solve the "Double Tap" and "Ghost Expiry" bugs
  if (existingCard.status === 'IN_PROGRESS') {
    throwError('You have already accepted this card.', 400); 
  } else if (existingCard.status === 'PENALTY') {
    throwError('Too late! This card has already expired and a penalty was applied.', 410);
  } else if (existingCard.status !== 'SENT' && existingCard.status !== 'WAITING') {
    throwError(`Cannot accept card. It is already marked as ${existingCard.status.toLowerCase()}.`, 400);
  }

  // Check receiver's own active accepted cards
  const { count } = await supabase
    .from('room_card_sends')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', receiverId)
    .eq('status', 'IN_PROGRESS');

  if ((count || 0) >= 2) {
    throwError('You already have 2 active cards in progress. Complete or close one first.', 429);
  }

  // Perform the actual update now that it is validated
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({
      status:              'IN_PROGRESS',
      accepted_at:         new Date().toISOString(),
      // Penalty 2: receiver has 48h to complete once accepted
      completion_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', sendId)
    .select(`
      id, room_id, sender_id, receiver_id, status, accepted_at, message,
      cards ( id, name, power_description, card_type )
    `)
    .single();

  if (error || !data) throwError('Failed to accept card.', 500);

  // ── Notify sender: their card was accepted ───────────────────────
  const cardName = data.cards?.name || 'your card';
  await createNotification(
    data.sender_id,
    'CARD_ACCEPTED',
    '✅ Card Accepted!',
    `Your partner accepted "${cardName}" and is working on it.`,
    { send_id: data.id, card_id: data.cards?.id, room_id: data.room_id }
  );

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

  // ── Notify sender: their card was deflected ──────────────────────
  await createNotification(
    data.sender_id,
    'CARD_DEFLECTED',
    '🛡️ Card Deflected',
    'Your partner used a Deflect card. The moment has passed without penalty.',
    { send_id: data.id, room_id: data.room_id }
  );

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

  // ── Notify sender: receiver marked card as complete, awaiting confirmation ──
  await createNotification(
    data.sender_id,
    'CARD_COMPLETED',
    '🎉 Card Completed!',
    'Your partner completed the card challenge! Tap to confirm.',
    { send_id: data.id, room_id: data.room_id }
  );

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

  // ── Notify receiver: sender confirmed — card is fully done ───────────
  await createNotification(
    data.receiver_id,
    'CARD_CONFIRMED',
    '✨ Challenge Confirmed!',
    'Your partner confirmed the card is done. Well played 👏',
    { send_id: data.id, room_id: data.room_id }
  );

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
    .select('id, room_id, sender_id, receiver_id, status, reminder_sent_at, reminder_count')
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
    .update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count:   (existing.reminder_count || 0) + 1,
    })
    .eq('id', sendId);

  // ── Notify sender: they are being nudged to confirm ────────────────
  await createNotification(
    existing.sender_id,
    'CARD_REMINDER',
    '🔔 Reminder from Partner',
    'Your partner is waiting for you to confirm their completed card.',
    { send_id: existing.id, room_id: existing.room_id }
  );

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
  await resolveOverdueStatuses(userId, roomId); // lazily update before returning
  await resolvePendingPenalties(userId, roomId);

  // ── CARD_DEADLINE_WARN: warn receiver if card expires within 4h ──
  const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const { data: nearDeadline } = await supabase
    .from('room_card_sends')
    .select('id, room_id, sender_id, respond_deadline, cards(name)')
    .eq('receiver_id', userId)
    .eq('room_id', roomId)
    .eq('status', 'SENT')
    .eq('deadline_warned', false)   // only warn once
    .lte('respond_deadline', fourHoursFromNow)
    .gt('respond_deadline', new Date().toISOString()); // not yet expired

  if (nearDeadline?.length) {
    await Promise.allSettled(nearDeadline.map(async (send) => {
      const cardName = send.cards?.name || 'a card';
      const deadline = new Date(send.respond_deadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      await createNotification(
        userId,
        'CARD_DEADLINE_WARN',
        '⏰ Card Expiring Soon!',
        `"${cardName}" must be accepted or responded to by ${deadline} or you may receive a penalty.`,
        { send_id: send.id, room_id: send.room_id }
      );
      // Mark warned so we don't spam
      await supabase.from('room_card_sends')
        .update({ deadline_warned: true })
        .eq('id', send.id);
    }));
  }

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
const getSendLimits = async (userId, roomId) => {
  await resolveOverdueStatuses(userId, roomId);
  await resolvePendingPenalties(userId, roomId);
  const todayCount  = await checkDailySendLimit(userId, roomId);
  const activeCount = await checkActiveSendLimit(userId, roomId);
  return {
    daily_sent:       todayCount,
    daily_limit:      2,
    daily_remaining:  Math.max(0, 2 - todayCount),
    active_count:     activeCount,
    active_limit:     2,
    active_remaining: Math.max(0, 2 - activeCount),
    can_send:         todayCount < 2 && activeCount < 2,
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
