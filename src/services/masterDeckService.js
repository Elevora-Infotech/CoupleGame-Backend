'use strict';
/**
 * @file   masterDeckService.js
 * @desc   Free card distribution from admin-managed Master Decks.
 *
 * TWO POOLS (admin-managed via admin panel):
 *   7_DAYS  pool → 7  free regular cards, NO deflect cards
 *   30_DAYS pool → 30 free regular cards + 5 deflect cards (auto)
 *
 * CARD SELECTION: 80/20 algorithm (same as purchase system)
 *   80% = cards user has NEVER received from this master deck
 *   20% = cards user HAS received before (repeat allowed)
 *
 * TRIGGER: Called automatically by roomService.joinRoom()
 *   - Partner joins → both users receive their free cards
 *   - Cards are permanently linked to that room_id
 *   - On room end → all cards expire automatically
 *
 * IDEMPOTENT: If called twice for same user+room, second call is
 *   a no-op (existing cards are found → skip).
 */

const { supabase } = require('../db/supabase');
const { grantDeflectCards } = require('./deflectService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// Fisher-Yates shuffle (same as purchaseService for consistency)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─────────────────────────────────────────────────────────────
// 80/20 Card Selection from a Master Deck Pool
//
// newCards = cards user has NEVER received from this master deck
// oldCards = cards user has received before from this master deck
// Returns exactly `count` card IDs.
// ─────────────────────────────────────────────────────────────
const selectFromMasterDeck = async (userId, deckId, count) => {
  // Cards user already received from THIS master deck (across all rooms)
  const { data: ownedRows } = await supabase
    .from('user_card_deck')
    .select('card_id')
    .eq('user_id', userId)
    .eq('master_deck_id', deckId);

  const ownedSet = new Set((ownedRows || []).map(r => r.card_id));

  // All cards available in this master deck pool
  const { data: poolRows, error } = await supabase
    .from('master_deck_cards')
    .select('card_id, cards(id, name, deflect_action, is_active)')
    .eq('deck_id', deckId);

  if (error) throwError('Failed to fetch master deck cards: ' + error.message, 500);

  // Only distribute regular (non-deflect) active cards
  const pool = (poolRows || []).filter(r => r.cards?.is_active && !r.cards?.deflect_action);

  if (!pool.length) {
    console.warn(`[MasterDeck] Pool for deck ${deckId} is empty or has no active regular cards.`);
    return [];
  }

  const newCards = pool.filter(r => !ownedSet.has(r.card_id));
  const oldCards = pool.filter(r =>  ownedSet.has(r.card_id));

  // Edge case: user received all cards in pool → full repeat
  if (newCards.length === 0) {
    return shuffle(oldCards).slice(0, count).map(r => r.card_id);
  }

  // 80/20 split
  const targetNew = Math.ceil(count * 0.80);
  const targetOld = count - targetNew;

  const shuffledNew = shuffle(newCards);
  const shuffledOld = shuffle(oldCards);

  const selectedNew = shuffledNew.slice(0, targetNew);
  const selectedOld = shuffledOld.slice(0, Math.min(targetOld, shuffledOld.length));

  let result = [...selectedNew, ...selectedOld];

  // Fill any gap with extra new cards
  if (result.length < count) {
    const gap   = count - result.length;
    const extra = shuffledNew.slice(targetNew, targetNew + gap);
    result = [...result, ...extra];
  }

  // Trim if we somehow have too many (safety net)
  return result.slice(0, count).map(r => r.card_id);
};

// ─────────────────────────────────────────────────────────────
// Idempotency Check
// Returns true if user already has free cards for this room.
// ─────────────────────────────────────────────────────────────
const alreadyGranted = async (userId, roomId) => {
  const { count } = await supabase
    .from('user_card_deck')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .not('master_deck_id', 'is', null);  // only free cards have master_deck_id

  return (count || 0) > 0;
};

// ─────────────────────────────────────────────────────────────
// MAIN: Grant Free Cards on Room Join
//
// Called by roomService.joinRoom() for BOTH users.
// plan_type: '7_DAYS' | '30_DAYS'
//
// 7_DAYS  → 7 regular cards from 7-day master deck
// 30_DAYS → 30 regular cards from 30-day master deck
//           + 5 deflect cards (via grantDeflectCards)
// ─────────────────────────────────────────────────────────────
const grantFreeCards = async (userId, roomId, planType) => {
  // Idempotency: skip if already granted
  if (await alreadyGranted(userId, roomId)) {
    console.log(`[MasterDeck] Cards already granted to user ${userId} for room ${roomId}. Skipping.`);
    return;
  }

  // Fetch the master deck for this plan
  const { data: deck, error: deckErr } = await supabase
    .from('master_decks')
    .select('id, plan_type, card_count, is_active')
    .eq('plan_type', planType)
    .single();

  if (deckErr || !deck) {
    console.error(`[MasterDeck] No master deck found for plan ${planType}`);
    return;
  }

  if (!deck.is_active) {
    console.warn(`[MasterDeck] Master deck for ${planType} is inactive. Skipping.`);
    return;
  }

  // Select cards using 80/20 algorithm
  const cardIds = await selectFromMasterDeck(userId, deck.id, deck.card_count);

  if (!cardIds.length) {
    console.error(`[MasterDeck] No cards selected for user ${userId} (pool may be empty). Admin must add cards to the ${planType} master deck.`);
    return;
  }

  // Bulk insert into user_card_deck
  const deckRows = cardIds.map(cardId => ({
    user_id:        userId,
    card_id:        cardId,
    room_id:        roomId,
    master_deck_id: deck.id,   // links back to which master deck gave this
    is_used:        false,
    expired:        false,
    is_visible:     true,
  }));

  const { error: insertErr } = await supabase
    .from('user_card_deck')
    .insert(deckRows);

  if (insertErr) {
    console.error(`[MasterDeck] Failed to insert free cards for user ${userId}:`, insertErr.message);
    return;
  }

  console.log(`[MasterDeck] Granted ${cardIds.length} free cards (${planType}) to user ${userId} in room ${roomId}`);

  // 30-day rooms also get 5 deflect cards (separate flow)
  if (planType === '30_DAYS') {
    await grantDeflectCards(userId, roomId);
  }
};

module.exports = { grantFreeCards, selectFromMasterDeck };
