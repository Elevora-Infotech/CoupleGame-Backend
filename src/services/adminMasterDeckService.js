'use strict';
/**
 * @file   adminMasterDeckService.js
 * @desc   Admin service for managing the two free card master decks.
 *
 * Master Decks (admin-managed, fixed 2 pools):
 *   7_DAYS  → 7 free cards per user on room join
 *   30_DAYS → 30 free cards per user on room join
 *
 * Admin can:
 *   - View both master decks + their card pools
 *   - Add cards to a deck pool
 *   - Remove cards from a deck pool
 *   - Update deck name/description (not card_count or plan_type — those are fixed)
 */

const { supabase } = require('../db/supabase');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// A. Get All Master Decks (with card count summary)
// GET /admin/master-decks
// ─────────────────────────────────────────────────────────────
const getAllMasterDecks = async () => {
  const { data, error } = await supabase
    .from('master_decks')
    .select(`
      id, plan_type, name, description, card_count, is_active, created_at,
      master_deck_cards ( id )
    `)
    .order('plan_type', { ascending: true });

  if (error) throwError(error.message, 400);

  return data.map(deck => ({
    ...deck,
    pool_size: deck.master_deck_cards?.length || 0,
    master_deck_cards: undefined,  // don't expose raw join array
  }));
};

// ─────────────────────────────────────────────────────────────
// B. Get One Master Deck with Full Card List
// GET /admin/master-decks/:deckId
// ─────────────────────────────────────────────────────────────
const getMasterDeckById = async (deckId) => {
  const { data: deck, error: deckErr } = await supabase
    .from('master_decks')
    .select('id, plan_type, name, description, card_count, is_active, created_at')
    .eq('id', deckId)
    .single();

  if (deckErr || !deck) throwError('Master deck not found.', 404);

  const { data: cards, error: cardsErr } = await supabase
    .from('master_deck_cards')
    .select(`
      id, added_at,
      cards (
        id, name, power_description, card_type, is_active, deflect_action,
        card_categories ( name, theme_color )
      )
    `)
    .eq('deck_id', deckId)
    .order('added_at', { ascending: false });

  if (cardsErr) throwError(cardsErr.message, 400);

  return {
    ...deck,
    pool_size: cards.length,
    cards: cards.map(c => ({
      master_deck_card_id: c.id,
      added_at: c.added_at,
      ...c.cards,
    })),
  };
};

// ─────────────────────────────────────────────────────────────
// C. Update Master Deck Metadata (name / description only)
// PUT /admin/master-decks/:deckId
// ─────────────────────────────────────────────────────────────
const updateMasterDeck = async (deckId, { name, description, is_active }) => {
  const updates = {};
  if (name        !== undefined) updates.name        = name.trim();
  if (description !== undefined) updates.description = description;
  if (is_active   !== undefined) updates.is_active   = is_active;
  updates.updated_at = new Date().toISOString();

  if (!Object.keys(updates).length) throwError('No fields to update.', 400);

  const { data, error } = await supabase
    .from('master_decks')
    .update(updates)
    .eq('id', deckId)
    .select()
    .single();

  if (error || !data) throwError('Master deck not found or update failed.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// D. Add Card to Master Deck Pool
// POST /admin/master-decks/:deckId/cards
// Body: { card_id }
// Rules:
//   - Can only add regular (non-deflect) cards
//   - Card must be active in the catalog
//   - Duplicate add is silently ignored (UNIQUE constraint)
// ─────────────────────────────────────────────────────────────
const addCardToMasterDeck = async (deckId, cardId, adminId) => {
  // Validate deck exists
  const { data: deck, error: deckErr } = await supabase
    .from('master_decks')
    .select('id, plan_type, is_active')
    .eq('id', deckId)
    .single();

  if (deckErr || !deck) throwError('Master deck not found.', 404);
  if (!deck.is_active) throwError('This master deck is currently inactive.', 400);

  // Validate card exists and is a regular card
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('id, name, deflect_action, is_active')
    .eq('id', cardId)
    .single();

  if (cardErr || !card) throwError('Card not found in catalog.', 404);
  if (!card.is_active) throwError(`Card "${card.name}" is inactive and cannot be added to a master deck.`, 400);
  if (card.deflect_action) {
    throwError(
      `"${card.name}" is a deflect card. Deflect cards are granted automatically and cannot be added to a master deck.`,
      400
    );
  }

  // Insert (unique constraint prevents duplicates)
  const { data, error } = await supabase
    .from('master_deck_cards')
    .insert([{ deck_id: deckId, card_id: cardId, added_by: adminId }])
    .select(`
      id, added_at,
      cards ( id, name, card_type, power_description )
    `)
    .single();

  // Silently handle duplicate
  if (error?.code === '23505') {
    return { message: `"${card.name}" is already in this deck pool.`, already_exists: true };
  }
  if (error) throwError('Failed to add card: ' + error.message, 500);

  return { message: `"${card.name}" added to the ${deck.plan_type} master deck.`, card: data };
};

// ─────────────────────────────────────────────────────────────
// E. Remove Card from Master Deck Pool
// DELETE /admin/master-decks/:deckId/cards/:masterDeckCardId
// Removes the card from the pool (does NOT affect already-distributed user cards)
// ─────────────────────────────────────────────────────────────
const removeCardFromMasterDeck = async (deckId, masterDeckCardId) => {
  const { data, error } = await supabase
    .from('master_deck_cards')
    .delete()
    .eq('id', masterDeckCardId)
    .eq('deck_id', deckId)
    .select('id, card_id, cards(name)')
    .single();

  if (error || !data) throwError('Card entry not found in this deck.', 404);
  return { message: `"${data.cards?.name}" removed from master deck pool.` };
};

// ─────────────────────────────────────────────────────────────
// F. Get Distribution Stats — how many users received cards
//    from each master deck (admin analytics)
// GET /admin/master-decks/:deckId/stats
// ─────────────────────────────────────────────────────────────
const getMasterDeckStats = async (deckId) => {
  const { data: deck } = await supabase
    .from('master_decks')
    .select('id, plan_type, name, card_count')
    .eq('id', deckId)
    .single();

  if (!deck) throwError('Master deck not found.', 404);

  // Distinct users who received cards from this deck
  const { count: totalDistributions } = await supabase
    .from('user_card_deck')
    .select('id', { count: 'exact', head: true })
    .eq('master_deck_id', deckId);

  const { count: uniqueUsers } = await supabase
    .from('user_card_deck')
    .select('user_id', { count: 'exact', head: true })
    .eq('master_deck_id', deckId);

  // Pool size
  const { count: poolSize } = await supabase
    .from('master_deck_cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  return {
    deck_id:              deckId,
    plan_type:            deck.plan_type,
    name:                 deck.name,
    cards_per_user:       deck.card_count,
    pool_size:            poolSize || 0,
    total_cards_given:    totalDistributions || 0,
    unique_users_served:  uniqueUsers || 0,
  };
};

module.exports = {
  getAllMasterDecks,
  getMasterDeckById,
  updateMasterDeck,
  addCardToMasterDeck,
  removeCardFromMasterDeck,
  getMasterDeckStats,
};
