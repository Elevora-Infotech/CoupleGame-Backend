'use strict';
/**
 * @file   penaltyService.js
 * @desc   SoulShuffle Penalty System — v1
 *
 * ──────────────────────────────────────────────────────────────
 * PENALTY 1: Non-Acceptance
 *   Trigger : Card SENT → 24h → WAITING → 24h → status=PENALTY
 *   Action  : Remove 1 random unused card from receiver's deck
 *   Who     : Penalizes the RECEIVER (who ignored the card)
 *   Visible : Both players see which card was lost
 *
 * PENALTY 2: Accepted But Not Completed
 *   Trigger : Card IN_PROGRESS → 48h → completion_deadline passes
 *   Action  : Ban SENDER from sending new cards for 24 hours
 *   Who     : Penalizes the SENDER (whose card was abandoned)
 *             Wait — re-reading spec: ban is on the receiver (accepted
 *             but never completed). The RECEIVER is the one who accepted
 *             and did not finish. So ban applies to RECEIVER's sending.
 *   Visible : Both see message, receiver sees the ban timer.
 *
 * PENALTY 3: Rejection
 *   Trigger : Receiver explicitly presses Reject button
 *   Action  : Transfer 1 asset from RECEIVER to SENDER
 *             Priority: unused card → deflect card → master pool bonus
 *   Who     : Penalizes the RECEIVER (who rejected)
 * ──────────────────────────────────────────────────────────────
 */

const { supabase } = require('../db/supabase');
const { createNotification } = require('./notificationService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// HELPER: Pick a random item from an array
// ─────────────────────────────────────────────────────────────
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─────────────────────────────────────────────────────────────
// HELPER: Write to penalty_log (for both players to see)
// ─────────────────────────────────────────────────────────────
const logPenalty = async ({
  roomId, sendId, penalizedUser, penaltyType,
  message, cardRemovedId = null, cardTransferredId = null, banExpiresAt = null,
}) => {
  const { error } = await supabase.from('penalty_log').insert([{
    room_id:             roomId,
    send_id:             sendId,
    penalized_user:      penalizedUser,
    penalty_type:        penaltyType,
    message,
    card_removed_id:     cardRemovedId,
    card_transferred_id: cardTransferredId,
    ban_expires_at:      banExpiresAt,
  }]);
  if (error) console.error('[PenaltyService] Failed to write penalty log:', error.message);
};

// ─────────────────────────────────────────────────────────────
// HELPER: Check if a user is currently banned from sending
// Returns { isBanned: bool, bannedUntil: ISO string | null }
// Called by deckService.sendCard before allowing a send.
// ─────────────────────────────────────────────────────────────
const checkSendBan = async (userId, roomId) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_send_bans')
    .select('id, banned_until')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('is_active', true)
    .gt('banned_until', now)
    .order('banned_until', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return { isBanned: false, bannedUntil: null };
  return { isBanned: true, bannedUntil: data.banned_until };
};

// ─────────────────────────────────────────────────────────────
// HELPER: Lazily check for expired bans and notify the user
// ─────────────────────────────────────────────────────────────
const resolveLiftedBans = async (userId) => {
  const now = new Date().toISOString();
  
  // Find bans that have expired but haven't been notified yet
  const { data: expiredBans } = await supabase
    .from('user_send_bans')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('banned_until', now)
    .eq('ban_lifted_notified', false);
    
  if (expiredBans?.length) {
    // Notify user
    await createNotification(
      userId,
      'SEND_BAN_LIFTED',
      '✅ Ban Lifted',
      'Your sending ban has been lifted. You can now send cards again.'
    );
    
    // Mark as notified and inactive
    await Promise.allSettled(expiredBans.map(ban => 
      supabase.from('user_send_bans')
        .update({ is_active: false, ban_lifted_notified: true })
        .eq('id', ban.id)
    ));
  }
};

// ─────────────────────────────────────────────────────────────
// PENALTY 1: Non-Acceptance
// Called by the lazy resolver (resolveOverdueStatuses) when it
// detects a card that just crossed into PENALTY status.
// Removes 1 random unused card from the receiver's deck.
// ─────────────────────────────────────────────────────────────
const applyNonAcceptancePenalty = async (sendRecord) => {
  const { id: sendId, room_id: roomId, receiver_id: receiverId } = sendRecord;

  // 1. Find a random unused, non-expired card in receiver's deck FOR THIS SPECIFIC ROOM
  const { data: deckCards } = await supabase
    .from('user_card_deck')
    .select('id, card_id, cards(name)')
    .eq('user_id', receiverId)
    .eq('room_id', roomId)
    .eq('is_used', false)
    .eq('expired', false);

  if (!deckCards || deckCards.length === 0) {
    // No cards to remove — log it but don't crash
    console.warn('[PenaltyService] P1: No unused cards to remove for receiver:', receiverId);
    await logPenalty({
      roomId, sendId, penalizedUser: receiverId,
      penaltyType: 'NON_ACCEPTANCE',
      message: 'A moment slipped away. No card to remove (deck is empty).',
    });
    return { penalty_type: 'NON_ACCEPTANCE', card_removed: null };
  }

  const cardToRemove = pickRandom(deckCards);

  // 2. Mark it as expired (soft-remove — don't hard delete for audit)
  await supabase
    .from('user_card_deck')
    .update({ expired: true, is_visible: false })
    .eq('id', cardToRemove.id)
    .eq('user_id', receiverId);

  // 3. Log the penalty (both players can see this)
  await logPenalty({
    roomId, sendId, penalizedUser: receiverId,
    penaltyType: 'NON_ACCEPTANCE',
    message: 'A moment slipped away. One card was removed.',
    cardRemovedId: cardToRemove.id,
  });

  console.log(`[PenaltyService] P1 applied: removed card "${cardToRemove.cards?.name}" from receiver ${receiverId}`);

  // ── Notify receiver of the penalty ────────────────────────────────
  await createNotification(
    receiverId,
    'PENALTY_RECEIVED',
    '⚠️ Penalty: Card Removed',
    `You ignored a card for too long. One card ("${cardToRemove.cards?.name || 'unknown'}") was removed from your deck.`,
    { send_id: sendId, room_id: roomId }
  );

  return { penalty_type: 'NON_ACCEPTANCE', card_removed: cardToRemove };
};

// ─────────────────────────────────────────────────────────────
// PENALTY 2: Accepted But Not Completed (Send Ban)
// Called when a card stays IN_PROGRESS past its completion_deadline.
// Bans the RECEIVER (who accepted but didn't finish) from sending for 24h.
// ─────────────────────────────────────────────────────────────
const applyIncompletePenalty = async (sendRecord) => {
  const { id: sendId, room_id: roomId, receiver_id: receiverId } = sendRecord;

  const bannedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // 1. Create ban record
  const { error: banErr } = await supabase
    .from('user_send_bans')
    .insert([{
      user_id:      receiverId,
      room_id:      roomId,
      send_id:      sendId,
      reason:       'INCOMPLETE_CARD',
      banned_until: bannedUntil,
      is_active:    true,
    }]);

  if (banErr) {
    console.error('[PenaltyService] P2: Failed to create ban:', banErr.message);
  }

  // 2. Mark the send as PENALTY status
  await supabase
    .from('room_card_sends')
    .update({ status: 'PENALTY', penalty_triggered_at: new Date().toISOString() })
    .eq('id', sendId);

  // 3. Log the penalty
  await logPenalty({
    roomId, sendId, penalizedUser: receiverId,
    penaltyType: 'INCOMPLETE_CARD',
    message: 'Something was started but left unfinished. Sending is paused for 24 hours.',
    banExpiresAt: bannedUntil,
  });

  console.log(`[PenaltyService] P2 applied: send ban for receiver ${receiverId} until ${bannedUntil}`);

  // ── Notify receiver of the send ban ───────────────────────────────
  const banUntilFormatted = new Date(bannedUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  await createNotification(
    receiverId,
    'SEND_BAN_RECEIVED',
    '🚫 Sending Paused',
    `You accepted a card but didn't finish it. Sending cards is paused until ${banUntilFormatted}.`,
    { send_id: sendId, room_id: roomId, banned_until: bannedUntil }
  );

  return { penalty_type: 'INCOMPLETE_CARD', banned_until: bannedUntil };
};

// ─────────────────────────────────────────────────────────────
// HELPER: Find best transferable asset from receiver's deck
// Priority: 1. Random unused regular card
//           2. Any unused deflect card
//           3. null (triggers master pool bonus in caller)
// ─────────────────────────────────────────────────────────────
const findTransferableAsset = async (userId, roomId) => {
  // Priority 1: random unused non-deflect card in THIS ROOM
  const { data: regularCards } = await supabase
    .from('user_card_deck')
    .select('id, card_id, cards(name, deflect_action)')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('is_used', false)
    .eq('expired', false);

  const nonDeflect = (regularCards || []).filter(c => !c.cards?.deflect_action);
  if (nonDeflect.length > 0) return { card: pickRandom(nonDeflect), source: 'deck' };

  // Priority 2: any unused deflect card
  const deflect = (regularCards || []).filter(c => c.cards?.deflect_action);
  if (deflect.length > 0) return { card: pickRandom(deflect), source: 'deflect' };

  // Priority 3: nothing available — caller awards from master pool
  return { card: null, source: 'master_pool' };
};

// ─────────────────────────────────────────────────────────────
// HELPER: Award a random bonus card from the Master Pool
// Master Pool = any active card in the cards table
// ─────────────────────────────────────────────────────────────
const awardFromMasterPool = async (userId, roomId) => {
  const { data: poolCards } = await supabase
    .from('cards')
    .select('id, name')
    .eq('is_active', true)
    .is('deflect_action', null)
    .limit(50);

  if (!poolCards || poolCards.length === 0) return null;

  const chosen = pickRandom(poolCards);

  const { data: newDeckCard, error } = await supabase
    .from('user_card_deck')
    .insert([{
      user_id:  userId,
      card_id:  chosen.id,
      room_id:  roomId,
      is_used:  false,
      expired:  false,
    }])
    .select('id, card_id, cards(name)')
    .single();

  if (error) {
    console.error('[PenaltyService] Failed to award master pool card:', error.message);
    return null;
  }

  return newDeckCard;
};

// ─────────────────────────────────────────────────────────────
// PENALTY 3: Rejection
// Called when receiver explicitly presses the Reject button.
// Transfers an asset from receiver to sender.
// ─────────────────────────────────────────────────────────────
const rejectCard = async (receiverId, sendId) => {
  // 1. Fetch the send record — verify receiver and status
  const { data: send, error: sendErr } = await supabase
    .from('room_card_sends')
    .select('id, room_id, sender_id, receiver_id, status')
    .eq('id', sendId)
    .eq('receiver_id', receiverId)
    .single();

  if (sendErr || !send) throwError('Card not found or not yours to reject.', 404);

  const REJECTABLE = ['SENT', 'WAITING'];
  if (!REJECTABLE.includes(send.status)) {
    throwError(`Cannot reject a card with status "${send.status}". Only SENT or WAITING cards can be rejected.`, 409);
  }

  const { sender_id: senderId, room_id: roomId } = send;

  // 2. Close the card → REJECTED
  await supabase
    .from('room_card_sends')
    .update({ status: 'REJECTED', rejected_at: new Date().toISOString() })
    .eq('id', sendId);

  // 3. Find what to transfer from receiver → sender
  const { card: assetCard, source } = await findTransferableAsset(receiverId, roomId);

  let transferredCard = null;

  if (assetCard) {
    // Transfer: move card ownership from receiver to sender
    const { data: transferred } = await supabase
      .from('user_card_deck')
      .update({
        user_id:  senderId,       // new owner = sender
        room_id:  roomId,
        is_used:  false,
        expired:  false,
      })
      .eq('id', assetCard.id)
      .select('id, card_id, cards(name, deflect_action)')
      .single();
    transferredCard = transferred;
  } else {
    // No cards at all — award from master pool to sender directly
    transferredCard = await awardFromMasterPool(senderId, roomId);
  }

  // 4. Log the penalty
  await logPenalty({
    roomId, sendId, penalizedUser: receiverId,
    penaltyType: 'REJECTION',
    message: 'A moment was declined. A new opportunity has moved elsewhere.',
    cardTransferredId: transferredCard?.id || null,
  });

  console.log(`[PenaltyService] P3 applied: rejection by ${receiverId}. Asset (${source}) transferred to ${senderId}`);

  // ── Notify original sender: their card was rejected + they received an asset ──
  await createNotification(
    senderId,
    'CARD_REJECTED',
    '🗑️ Card Rejected',
    transferredCard
      ? `Your partner rejected your card. As compensation, a card has been transferred to you.`
      : `Your partner rejected your card.`,
    { send_id: sendId, room_id: send.room_id }
  );

  return {
    outcome:          'REJECTED',
    message:          'A moment was declined. A new opportunity has moved elsewhere.',
    card_transferred: transferredCard
      ? {
          id:              transferredCard.id,
          name:            transferredCard.cards?.name,
          source,          // 'deck' | 'deflect' | 'master_pool'
          new_owner:       senderId,
        }
      : null,
  };
};

// ─────────────────────────────────────────────────────────────
// PENALTY RESOLVER: Called lazily on each request
// Checks for cards that have crossed penalty thresholds and
// applies consequences only once (idempotent via status check).
// ─────────────────────────────────────────────────────────────
const resolvePendingPenalties = async (userId, roomId = null) => {
  const now = new Date().toISOString();

  // ── Penalty 1: PENALTY status cards (non-acceptance) ──────
  // room_card_sends lazily moves SENT/WAITING → PENALTY in resolveOverdueStatuses.
  // We pick up those newly-penalized records and apply the card-removal consequence.
  let p1Query = supabase
    .from('room_card_sends')
    .select('id, room_id, sender_id, receiver_id, penalty_triggered_at, status')
    .eq('receiver_id', userId)
    .eq('status', 'PENALTY')
    .is('penalty_triggered_at', null); // not yet processed by penalty engine
  if (roomId) p1Query = p1Query.eq('room_id', roomId);
  const { data: newPenalties } = await p1Query;

  if (newPenalties?.length) {
    for (const send of newPenalties) {
      // Mark as processed immediately to prevent double-penalty
      await supabase
        .from('room_card_sends')
        .update({ penalty_triggered_at: now })
        .eq('id', send.id);

      await applyNonAcceptancePenalty(send);
    }
  }

  // ── Penalty 2: IN_PROGRESS cards past completion_deadline ─
  let p2Query = supabase
    .from('room_card_sends')
    .select('id, room_id, sender_id, receiver_id, completion_deadline, status')
    .eq('receiver_id', userId)
    .eq('status', 'IN_PROGRESS')
    .not('completion_deadline', 'is', null)
    .lt('completion_deadline', now);
  if (roomId) p2Query = p2Query.eq('room_id', roomId);
  const { data: overdueInProgress } = await p2Query;

  if (overdueInProgress?.length) {
    for (const send of overdueInProgress) {
      await applyIncompletePenalty(send);
    }
  }
};

// ─────────────────────────────────────────────────────────────
// GET PENALTY LOG: Both users can see penalty history in a room
// ─────────────────────────────────────────────────────────────
const getPenaltyLog = async (userId, roomId) => {
  // First resolve any pending penalties for this user
  await resolvePendingPenalties(userId, roomId);

  const { data, error } = await supabase
    .from('penalty_log')
    .select(`
      id, penalty_type, message, created_at,
      penalized_user,
      ban_expires_at,
      card_removed_id,
      card_transferred_id,
      room_card_sends (
        id, status,
        cards ( name )
      )
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

module.exports = {
  checkSendBan,
  resolveLiftedBans,
  rejectCard,
  resolvePendingPenalties,
  applyNonAcceptancePenalty,
  applyIncompletePenalty,
  getPenaltyLog,
};
