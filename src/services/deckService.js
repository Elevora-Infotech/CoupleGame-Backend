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
// Get Available Cards (unused + not expired)
// Used for the room card-picker screen before the game starts
// ─────────────────────────────────────────────────────────────
const getAvailableCards = async (userId) => {
  const { data, error } = await supabase
    .from('v_user_deck_detail')
    .select('*')
    .eq('user_id', userId)
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

module.exports = {
  getUserDeck,
  getAvailableCards,
  playCard,
};
