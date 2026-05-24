/**
 * @file   deckService.js
 * @desc   User card deck management service.
 *
 * Responsibilities:
 *  - Fetch user's active deck (all visible cards)
 *  - Fetch only available cards (unused + unexpired) for room selection
 *  - Mark a card as played in a room (server-side validation)
 */

'use strict';

const { supabase } = require('../db/supabase');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// Get User's Full Deck (all visible cards)
// Uses the v_user_deck_detail view for a single efficient query
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
// Strictly returns only cards that:
//   - belong to this user
//   - are tied to the exact current room (room_id match)
//   - have NOT been used yet
//   - have NOT expired
// ─────────────────────────────────────────────────────────────
const getAvailableCards = async (userId, roomId) => {
  if (!roomId) {
    throwError('room_id is required to fetch available cards.', 400);
  }

  const { data, error } = await supabase
    .from('v_user_deck_detail')
    .select('*')
    .eq('user_id', userId)
    .eq('room_id', roomId)     // ← Option B: only cards from THIS room
    .eq('is_used', false)
    .eq('expired', false)
    .eq('is_visible', true)
    .order('acquired_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

// ─────────────────────────────────────────────────────────────
// Play a Card in a Room
//
// Validates:
//  - Card belongs to this user
//  - Card has not been used already
//  - Card has not expired
// Then marks it used and links it to the room.
// ─────────────────────────────────────────────────────────────
const playCard = async (userId, deckCardId, roomId) => {
  // Fetch the card first to validate ownership + state
  const { data: card, error: fetchErr } = await supabase
    .from('user_card_deck')
    .select('id, user_id, is_used, expired')
    .eq('id', deckCardId)
    .single();

  if (fetchErr || !card) throwError('Card not found in your deck.', 404);

  if (card.user_id !== userId)  throwError('This card does not belong to you.', 403);
  if (card.is_used)             throwError('This card has already been played.', 409);
  if (card.expired)             throwError('This card has expired.', 410);

  // Mark as used and link to room
  const { data: updated, error: updateErr } = await supabase
    .from('user_card_deck')
    .update({
      is_used: true,
      room_id: roomId,
      used_at: new Date().toISOString(),
    })
    .eq('id', deckCardId)
    .eq('user_id', userId)   // double-check ownership at DB level
    .select()
    .single();

  if (updateErr) throwError('Failed to play card.', 500);
  return updated;
};

// ─────────────────────────────────────────────────────────────
// Send a Card to Partner in the Same Room
//
// Validates:
//  - Card belongs to sender
//  - Card has not been used/sent already
//  - Card has not expired
//  - Receiver is in the same room
//  - Optional message is ≤ 200 chars
// Then:
//  - Marks card as used (is_used = TRUE)
//  - Creates a room_card_sends record
//  - Returns the full send record (caller emits socket event)
// ─────────────────────────────────────────────────────────────
const sendCard = async (senderId, deckCardId, roomId, receiverId, message) => {
  // 1. Validate message length
  if (message && message.length > 200) {
    throwError('Message must be 200 characters or less.', 400);
  }

  // 2. Fetch the deck card — check ownership + state
  const { data: card, error: fetchErr } = await supabase
    .from('user_card_deck')
    .select('id, user_id, card_id, is_used, expired, room_id')
    .eq('id', deckCardId)
    .single();

  if (fetchErr || !card) throwError('Card not found in your deck.', 404);
  if (card.user_id !== senderId)  throwError('This card does not belong to you.', 403);
  if (card.is_used)               throwError('This card has already been used or sent.', 409);
  if (card.expired)               throwError('This card has expired.', 410);

  // 3. Verify receiver is actually in the same room
  const { data: roomMember, error: memberErr } = await supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', receiverId)
    .single();

  if (memberErr || !roomMember) {
    throwError('Receiver is not in this room.', 400);
  }

  // 4. Mark card as used
  const { error: useErr } = await supabase
    .from('user_card_deck')
    .update({
      is_used: true,
      room_id: roomId,
      used_at: new Date().toISOString(),
    })
    .eq('id', deckCardId)
    .eq('user_id', senderId);

  if (useErr) throwError('Failed to mark card as used.', 500);

  // 5. Create the send record
  const { data: sendRecord, error: sendErr } = await supabase
    .from('room_card_sends')
    .insert([{
      room_id:     roomId,
      sender_id:   senderId,
      receiver_id: receiverId,
      deck_card_id: deckCardId,
      card_id:     card.card_id,
      message:     message || null,
    }])
    .select(`
      id, room_id, sender_id, receiver_id, message, sent_at, is_seen,
      cards ( id, name, power_description, card_type,
              card_categories ( name, theme_color ) )
    `)
    .single();

  if (sendErr) throwError('Failed to create card send record.', 500);
  return sendRecord;
};

// ─────────────────────────────────────────────────────────────
// Mark a Received Card as Seen
// Called by the receiver after they open/view the sent card
// ─────────────────────────────────────────────────────────────
const markCardSeen = async (userId, sendId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .update({ is_seen: true, seen_at: new Date().toISOString() })
    .eq('id', sendId)
    .eq('receiver_id', userId)   // only receiver can mark it seen
    .select()
    .single();

  if (error || !data) throwError('Send record not found or not yours.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// Get Card Send History for a Room
// Returns all sends (sent by user OR received by user) in the room
// ─────────────────────────────────────────────────────────────
const getCardSendHistory = async (userId, roomId) => {
  const { data, error } = await supabase
    .from('room_card_sends')
    .select(`
      id, room_id, sender_id, receiver_id, message, sent_at, is_seen, seen_at,
      cards ( id, name, power_description, card_type,
              card_categories ( name, theme_color ) )
    `)
    .eq('room_id', roomId)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('sent_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

module.exports = {
  getUserDeck,
  getAvailableCards,
  playCard,
  sendCard,
  markCardSeen,
  getCardSendHistory,
};
