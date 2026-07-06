'use strict';

/**
 * @file   deflectService.js
 * @desc   Deflect Card System — Server-side automatic action handlers.
 *
 * DEFLECT_ACTION codes (hardcoded — admin cannot change the logic):
 *   CANCEL_ANY         — Close any SENT/WAITING card. No penalty.
 *   CANCEL_SENT_ONLY   — Only close if card is still SENT (Nice Try).
 *   CANCEL_IN_PROGRESS — Close card even if IN_PROGRESS (Party Pooper). Bypasses normal acceptance guard.
 *   CANCEL_IMMUNE      — Close card + set is_deflect_immune (Not Today Satan).
 *   REVERSE_ROLES      — Cancel + re-send with sender/receiver swapped.
 *   TIMEOUT            — Add +10 min to deadline. Does NOT cancel.
 *
 * Admin can:  edit name, description, image, pick deflect_action from fixed dropdown.
 * Admin CANNOT: change what the action does.
 */

const { supabase } = require('../db/supabase');
const { createNotification } = require('./notificationService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// Statuses that are already terminal (no action possible)
const TERMINAL_STATUSES = ['COMPLETED', 'DEFLECTED', 'PENALTY', 'COMPLETED_BY_RECEIVER'];

// Actions that bypass the "IN_PROGRESS is already accepted" guard
const ALLOWS_IN_PROGRESS = ['CANCEL_IN_PROGRESS'];


// ─────────────────────────────────────────────────────────────
// Grant 5 Random Deflect Cards to a User for a Room
// Only called for 30-day rooms (roomService handles the condition).
// ─────────────────────────────────────────────────────────────
const grantDeflectCards = async (userId, roomId) => {
  const { data: allDeflectCards, error: fetchErr } = await supabase
    .from('cards')
    .select('id')
    .not('deflect_action', 'is', null)
    .eq('is_active', true);

  if (fetchErr || !allDeflectCards?.length) {
    console.error('[DeflectService] No deflect cards found in DB:', fetchErr?.message);
    return;
  }

  // Fisher-Yates shuffle → take 5
  const shuffled = [...allDeflectCards].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 5);

  const deckRows = selected.map(card => ({
    user_id:  userId,
    card_id:  card.id,
    room_id:  roomId,
    is_used:  false,
    expired:  false,
  }));

  const { error: insertErr } = await supabase.from('user_card_deck').insert(deckRows);
  if (insertErr) {
    console.error('[DeflectService] Failed to grant deflect cards:', insertErr.message);
  }
};


// ─────────────────────────────────────────────────────────────
// Get User's Available Deflect Cards for Popup
// ─────────────────────────────────────────────────────────────
const getDeflectCards = async (userId, roomId) => {
  const { data, error } = await supabase
    .from('user_card_deck')
    .select(`
      id, is_used, expired, acquired_at,
      cards (
        id, name, power_description, deflect_action, image_url,
        card_categories ( name, theme_color )
      )
    `)
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .eq('is_used', false)
    .eq('expired', false);

  if (error) throwError('Failed to fetch deflect cards.', 500);

  // Filter to only deflect cards in JS (avoids PostgREST join-filter issues)
  return (data || []).filter(d => d.cards?.deflect_action != null);
};


// ─────────────────────────────────────────────────────────────
// Use a Deflect Card (Main Entry Point)
// POST /user/deck/sends/:sendId/use-deflect
// Body: { deflect_deck_card_id }
// ─────────────────────────────────────────────────────────────
const useDeflectCard = async (userId, sendId, deflectDeckCardId) => {

  // ── STEP 1: Validate the target send ─────────────────────────
  const { data: send, error: sendErr } = await supabase
    .from('room_card_sends')
    .select(`
      id, room_id, sender_id, receiver_id, status,
      respond_deadline, penalty_deadline, is_deflect_immune,
      cards ( id, name, power_description, card_type, deflect_action )
    `)
    .eq('id', sendId)
    .single();

  if (sendErr || !send) throwError('Card not found.', 404);
  if (send.receiver_id !== userId) throwError('You are not the receiver of this card.', 403);
  if (send.sender_id === userId)   throwError('You cannot deflect your own card.', 403);

  // Already terminal?
  if (TERMINAL_STATUSES.includes(send.status)) {
    throwError('This card is already closed. Nothing to deflect.', 409);
  }

  // ── STEP 2: Validate the deflect deck card ───────────────────
  const { data: deckCard, error: deckErr } = await supabase
    .from('user_card_deck')
    .select(`
      id, user_id, card_id, is_used, expired, room_id,
      cards ( id, name, deflect_action, power_description )
    `)
    .eq('id', deflectDeckCardId)
    .single();

  if (deckErr || !deckCard)           throwError('Deflect card not found in your deck.', 404);
  if (deckCard.user_id !== userId)    throwError('This deflect card does not belong to you.', 403);
  if (deckCard.is_used)               throwError('This deflect card has already been played.', 409);
  if (deckCard.expired)               throwError('This deflect card has expired.', 410);
  if (!deckCard.cards?.deflect_action) throwError('This is not a deflect card.', 400);

  const deflectAction   = deckCard.cards.deflect_action;
  const deflectCardName = deckCard.cards.name;

  // ── STEP 3: Status guard (after knowing the deflect_action) ──
  // Most deflect cards only work BEFORE acceptance (SENT/WAITING).
  // CANCEL_IN_PROGRESS (Party Pooper) is the only one allowed on IN_PROGRESS.
  const allowsInProgress = ALLOWS_IN_PROGRESS.includes(deflectAction);

  if (send.status === 'IN_PROGRESS' && !allowsInProgress) {
    throwError('You already accepted this card. Deflect cards can only be used before acceptance.', 409);
  }
  if (send.status === 'COMPLETED_BY_RECEIVER') {
    throwError('Card completion is pending confirmation. Cannot deflect at this stage.', 409);
  }

  // ── STEP 4: Execute the matching action ──────────────────────
  let result;
  switch (deflectAction) {
    case 'CANCEL_ANY':         result = await handleCancelAny(send);           break;
    case 'CANCEL_SENT_ONLY':   result = await handleCancelSentOnly(send);      break;
    case 'CANCEL_IN_PROGRESS': result = await handleCancelInProgress(send);    break;
    case 'CANCEL_IMMUNE':      result = await handleCancelImmune(send);        break;
    case 'REVERSE_ROLES':      result = await handleReverseRoles(send, deflectDeckCardId); break;
    case 'TIMEOUT':            result = await handleTimeout(send);             break;
    default: throwError(`Unknown deflect action: ${deflectAction}`, 500);
  }

  // ── STEP 5: Mark deflect card as used (permanent) ────────────
  await supabase
    .from('user_card_deck')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', deflectDeckCardId)
    .eq('user_id', userId);

  // ── STEP 5.5: Notify the original sender ───────────────────────
  await createNotification(
    send.sender_id,
    'CARD_DEFLECTED',
    '🛡️ Deflect Card Used!',
    `Your partner played "${deflectCardName}": ${result.message}`,
    { send_id: sendId, room_id: send.room_id }
  );

  // ── STEP 6: Return structured result ─────────────────────────
  return {
    deflect_action:    deflectAction,
    deflect_card_name: deflectCardName,
    used_by:           userId,
    room_id:           send.room_id,
    original_send_id:  sendId,
    ...result,
  };
};


// ─────────────────────────────────────────────────────────────
// ACTION HANDLERS
// ─────────────────────────────────────────────────────────────

// ── CANCEL_ANY ────────────────────────────────────────────────
// Works on SENT or WAITING. Most deflect cards use this.
const handleCancelAny = async (send) => {
  if (!['SENT', 'WAITING'].includes(send.status)) {
    throwError('This card cannot be cancelled in its current state.', 409);
  }
  const { error } = await supabase
    .from('room_card_sends')
    .update({ status: 'DEFLECTED', deflected_at: new Date().toISOString() })
    .eq('id', send.id);
  if (error) throwError('Failed to cancel card.', 500);
  return { outcome: 'CANCELLED', message: 'Card cancelled. No penalty applied.' };
};

// ── CANCEL_SENT_ONLY ─────────────────────────────────────────
// Nice Try Card — only works the moment the card arrives (SENT).
const handleCancelSentOnly = async (send) => {
  if (send.status !== 'SENT') {
    throwError('The "Nice Try" card only works the moment a card is sent. This card is already past that window.', 409);
  }
  const { error } = await supabase
    .from('room_card_sends')
    .update({ status: 'DEFLECTED', deflected_at: new Date().toISOString() })
    .eq('id', send.id);
  if (error) throwError('Failed to cancel card.', 500);
  return { outcome: 'CANCELLED', message: 'Nice try! Card nullified on the spot.' };
};

// ── CANCEL_IN_PROGRESS ────────────────────────────────────────
// Party Pooper — ends any ongoing activity. Works on SENT, WAITING, or IN_PROGRESS.
const handleCancelInProgress = async (send) => {
  if (TERMINAL_STATUSES.includes(send.status)) {
    throwError('Party Pooper cannot act on a card that is already closed.', 409);
  }
  const { error } = await supabase
    .from('room_card_sends')
    .update({ status: 'DEFLECTED', deflected_at: new Date().toISOString() })
    .eq('id', send.id);
  if (error) throwError('Failed to cancel card.', 500);
  return { outcome: 'CANCELLED', message: 'Party pooped! Activity ended.' };
};

// ── CANCEL_IMMUNE ─────────────────────────────────────────────
// Not Today Satan — cancel + immune flag so sender cannot counter-deflect.
const handleCancelImmune = async (send) => {
  if (!['SENT', 'WAITING'].includes(send.status)) {
    throwError('This card cannot be cancelled in its current state.', 409);
  }
  const { error } = await supabase
    .from('room_card_sends')
    .update({
      status:            'DEFLECTED',
      deflected_at:      new Date().toISOString(),
      is_deflect_immune: true,
    })
    .eq('id', send.id);
  if (error) throwError('Failed to cancel card.', 500);
  return {
    outcome:           'CANCELLED_IMMUNE',
    is_deflect_immune: true,
    message:           'Not today! Card blocked. Cannot be counter-deflected.',
  };
};

// ── REVERSE_ROLES ─────────────────────────────────────────────
// Switcheroo / Role Reversal Defense.
// 1. Cancels original send
// 2. Creates new send with sender/receiver swapped
const handleReverseRoles = async (send, deflectDeckCardId) => {
  if (!['SENT', 'WAITING'].includes(send.status)) {
    throwError('Role reversal can only be used on a SENT or WAITING card.', 409);
  }

  const now = new Date();
  const respondDeadline = new Date(now.getTime() + 24 * 3600 * 1000);
  const penaltyDeadline = new Date(now.getTime() + 48 * 3600 * 1000);

  // A: Cancel original
  await supabase
    .from('room_card_sends')
    .update({ status: 'DEFLECTED', deflected_at: now.toISOString() })
    .eq('id', send.id);

  // B: Create reversed send
  const { data: newSend, error: insertErr } = await supabase
    .from('room_card_sends')
    .insert([{
      room_id:          send.room_id,
      sender_id:        send.receiver_id,   // original receiver → now sender
      receiver_id:      send.sender_id,     // original sender   → now receiver
      deck_card_id:     deflectDeckCardId,
      card_id:          send.cards?.id,
      message:          '🔄 The card was reversed on you!',
      status:           'SENT',
      respond_deadline: respondDeadline.toISOString(),
      penalty_deadline: penaltyDeadline.toISOString(),
    }])
    .select('id, sender_id, receiver_id, status, sent_at, respond_deadline')
    .single();

  if (insertErr) throwError('Failed to create reversed card send.', 500);

  return {
    outcome:      'REVERSED',
    new_send_id:  newSend.id,
    new_sender:   newSend.sender_id,
    new_receiver: newSend.receiver_id,
    message:      '🔄 Card reversed! Your partner now has to do their own card.',
    new_send:     newSend,
  };
};

// ── TIMEOUT ───────────────────────────────────────────────────
// The Time Out Card — +10 minutes added to deadline. Does NOT cancel.
const handleTimeout = async (send) => {
  if (!['SENT', 'WAITING'].includes(send.status)) {
    throwError('Time Out card can only be used on a SENT or WAITING card.', 409);
  }

  const TEN_MIN_MS = 10 * 60 * 1000;
  const newRespond = new Date(new Date(send.respond_deadline).getTime() + TEN_MIN_MS);
  const newPenalty = new Date(new Date(send.penalty_deadline).getTime() + TEN_MIN_MS);

  const { error } = await supabase
    .from('room_card_sends')
    .update({
      respond_deadline: newRespond.toISOString(),
      penalty_deadline: newPenalty.toISOString(),
    })
    .eq('id', send.id);

  if (error) throwError('Failed to extend deadline.', 500);

  return {
    outcome:              'TIMEOUT_EXTENDED',
    new_respond_deadline: newRespond.toISOString(),
    new_penalty_deadline: newPenalty.toISOString(),
    message:              '⏸️ Time out! You now have 10 more minutes.',
  };
};


module.exports = { grantDeflectCards, getDeflectCards, useDeflectCard };
