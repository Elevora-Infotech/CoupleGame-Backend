/**
 * @file   purchaseService.js
 * @desc   Core purchase logic for the EleVora Card Store.
 *
 * Responsibilities:
 *  1. Process RevenueCat webhook → validate → allocate cards (idempotent)
 *  2. 80/20 card selection algorithm (Fisher-Yates shuffle)
 *  3. User purchase history
 *
 * Security guarantees:
 *  - UNIQUE (transaction_id) at DB level prevents double allocation
 *    even if RevenueCat fires the webhook twice.
 *  - Cards are ONLY allocated inside this service — never from
 *    a direct client request.
 *  - All DB writes use service_role key (bypasses RLS).
 */

'use strict';

const { supabase } = require('../db/supabase');

// ─── Helper ──────────────────────────────────────────────────
const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// Fisher-Yates Shuffle (cryptographically fair random order)
// ─────────────────────────────────────────────────────────────
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─────────────────────────────────────────────────────────────
// 80/20 Card Selection Algorithm
//
// Rules:
//   - 80% of cards must be NEW (user never received from this bundle)
//   - 20% of cards can be OLD (user received before from this bundle)
//   - Exception: if user owns ALL cards in bundle → full repeat allowed
//   - Total returned is ALWAYS exactly cardCount
// ─────────────────────────────────────────────────────────────
const selectCardsForUser = async (userId, bundleId, cardCount) => {
  // STEP 1: All cards user ever received from THIS bundle (any purchase)
  const { data: ownedRows, error: ownedErr } = await supabase
    .from('user_card_deck')
    .select('card_id')
    .eq('user_id', userId)
    .eq('bundle_id', bundleId);

  if (ownedErr) throwError('Failed to fetch user card history.', 500);
  const ownedSet = new Set((ownedRows || []).map(r => r.card_id));

  // STEP 2: Full pool of cards available in this bundle
  // Filter out cards that are inactive OR belong to inactive categories
  const { data: poolRows, error: poolErr } = await supabase
    .from('bundle_cards')
    .select(`
      card_id,
      cards!inner (
        is_active,
        card_categories!inner ( is_active )
      )
    `)
    .eq('bundle_id', bundleId)
    .eq('cards.is_active', true)
    .eq('cards.card_categories.is_active', true);

  if (poolErr || !poolRows?.length) throwError('Bundle has no active cards to allocate.', 400);

  // STEP 3: Classify into new vs old
  const newCards = poolRows.filter(bc => !ownedSet.has(bc.card_id));
  const oldCards = poolRows.filter(bc =>  ownedSet.has(bc.card_id));

  // STEP 4: Exception — user exhausted ALL cards in this bundle
  if (newCards.length === 0) {
    // Full repeat mode — give all from old pool
    return shuffle(oldCards).slice(0, cardCount).map(bc => bc.card_id);
  }

  // STEP 5: Fixed 80/20 split
  const targetNew = Math.ceil(cardCount * 0.80); // e.g., 8 for N=10
  const targetOld = cardCount - targetNew;        // e.g., 2 for N=10

  const shuffledNew = shuffle(newCards);
  const shuffledOld = shuffle(oldCards);

  const selectedNew = shuffledNew.slice(0, targetNew);
  const selectedOld = shuffledOld.slice(0, Math.min(targetOld, shuffledOld.length));

  let result = [...selectedNew, ...selectedOld];

  // Edge case: not enough old cards → fill gap with extra new cards
  if (result.length < cardCount) {
    const gap   = cardCount - result.length;
    const extra = shuffledNew.slice(targetNew, targetNew + gap);
    result = [...result, ...extra];
  }

  return result.map(bc => bc.card_id);
};


// ─────────────────────────────────────────────────────────────
// Process RevenueCat Webhook
//
// Called by POST /store/purchase/verify
// This function is idempotent — safe to call multiple times
// for the same transaction (DB unique constraint protects it).
// ─────────────────────────────────────────────────────────────
const processWebhookPurchase = async (webhookBody) => {
  const { type, event } = webhookBody;

  // Only process successful first-time purchases
  if (type !== 'INITIAL_PURCHASE' && type !== 'NON_RENEWING_PURCHASE') {
    return { skipped: true, reason: `Event type "${type}" not processed.` };
  }

  const {
    app_user_id:      userId,
    product_id:       storeProductId,
    transaction_id:   transactionId,
    store:            platform,   // APPLE_STORE | PLAY_STORE
    price:            amountPaid,
    currency,
  } = event;

  const normalizedPlatform = platform === 'APPLE_STORE' ? 'ios' : 'android';

  // ── OPTION B: Room-Only Economy ───────────────────────────
  // User MUST be inside an ACTIVE room at the time of purchase.
  // Cards are immediately stamped with that room_id and will
  // all be destroyed (played or not) when the room ends.
  const { data: activeRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (roomErr || !activeRoom) {
    throwError('You must be inside an active game room to purchase cards.', 403);
  }
  const activeRoomId = activeRoom.id;

  // STEP 1: Check idempotency — already processed?
  const { data: existing } = await supabase
    .from('user_purchases')
    .select('id, status')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (existing?.status === 'completed') {
    return { skipped: true, reason: 'Transaction already processed.' };
  }

  // STEP 2: Look up which plan this product maps to
  const { data: product, error: productErr } = await supabase
    .from('store_products')
    .select('plan_id, bundle_plans(id, card_count, price, bundle_id)')
    .eq('store_product_id', storeProductId)
    .eq('platform', normalizedPlatform)
    .eq('is_active', true)
    .single();

  if (productErr || !product) {
    throwError(`Unknown product: ${storeProductId} on ${normalizedPlatform}`, 400);
  }

  const plan     = product.bundle_plans;
  const bundleId = plan.bundle_id;
  const cardCount= plan.card_count;

  // STEP 3: Create purchase record (status: pending)
  const { data: purchase, error: purchaseErr } = await supabase
    .from('user_purchases')
    .upsert([{
      user_id:          userId,
      bundle_id:        bundleId,
      plan_id:          plan.id,
      transaction_id:   transactionId,
      platform:         normalizedPlatform,
      store_product_id: storeProductId,
      amount_paid:      amountPaid || plan.price,
      currency:         currency || 'INR',
      cards_received:   0,
      status:           'pending',
    }], { onConflict: 'transaction_id' })
    .select()
    .single();

  if (purchaseErr) throwError('Failed to create purchase record.', 500);

  // STEP 4: Run 80/20 card selection algorithm
  const selectedCardIds = await selectCardsForUser(userId, bundleId, cardCount);

  if (!selectedCardIds.length) throwError('No cards could be selected.', 500);

  // STEP 5: Bulk insert into user_card_deck (room_id stamped immediately)
  const deckRows = selectedCardIds.map(cardId => ({
    user_id:     userId,
    card_id:     cardId,
    purchase_id: purchase.id,
    bundle_id:   bundleId,
    room_id:     activeRoomId,   // ← Option B: locked to active room from birth
  }));

  const { error: deckErr } = await supabase
    .from('user_card_deck')
    .insert(deckRows);

  if (deckErr) throwError('Failed to allocate cards to user deck.', 500);

  // STEP 6: Mark purchase as completed
  await supabase
    .from('user_purchases')
    .update({
      status:        'completed',
      cards_received: selectedCardIds.length,
      completed_at:  new Date().toISOString(),
    })
    .eq('id', purchase.id);

  return {
    success:        true,
    purchase_id:    purchase.id,
    cards_received: selectedCardIds.length,
  };
};

// ─────────────────────────────────────────────────────────────
// Mock Bypass Purchase (for development / before RevenueCat)
// ─────────────────────────────────────────────────────────────
const mockBypassPurchase = async (userId, bundleId, planId) => {
  // Same logic as processWebhookPurchase but simplified for bypassing
  const { data: activeRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (roomErr || !activeRoom) {
    throwError('You must be inside an active game room to purchase cards.', 403);
  }
  const activeRoomId = activeRoom.id;

  const { data: plan, error: planErr } = await supabase
    .from('bundle_plans')
    .select('price, card_count')
    .eq('id', planId)
    .single();

  if (planErr || !plan) throwError('Invalid plan ID.', 400);

  const transactionId = `BYPASS-${Math.floor(100000 + Math.random() * 900000)}`;

  const { data: purchase, error: purchaseErr } = await supabase
    .from('user_purchases')
    .upsert([{
      user_id:          userId,
      bundle_id:        bundleId,
      plan_id:          planId,
      transaction_id:   transactionId,
      platform:         'bypass',
      store_product_id: 'mock_bypass',
      amount_paid:      plan.price,
      currency:         'INR',
      cards_received:   0,
      status:           'pending',
    }], { onConflict: 'transaction_id' })
    .select()
    .single();

  if (purchaseErr) {
    console.error('Purchase Insert Error:', purchaseErr);
    throwError(`Failed to create purchase record: ${purchaseErr.message}`, 500);
  }

  const selectedCardIds = await selectCardsForUser(userId, bundleId, plan.card_count);
  if (!selectedCardIds.length) throwError('No cards could be selected.', 500);

  const deckRows = selectedCardIds.map(cardId => ({
    user_id:     userId,
    card_id:     cardId,
    purchase_id: purchase.id,
    bundle_id:   bundleId,
    room_id:     activeRoomId,
  }));

  const { error: deckErr } = await supabase
    .from('user_card_deck')
    .insert(deckRows);

  if (deckErr) {
    console.error('Deck Insert Error:', deckErr);
    throwError(`Failed to allocate cards to user deck: ${deckErr.message}`, 500);
  }

  await supabase
    .from('user_purchases')
    .update({
      status:        'completed',
      cards_received: selectedCardIds.length,
      completed_at:  new Date().toISOString(),
    })
    .eq('id', purchase.id);

  return {
    success:        true,
    purchase_id:    purchase.id,
    cards_received: selectedCardIds.length,
    transaction_id: transactionId,
  };
};



// ─────────────────────────────────────────────────────────────
// User: Get Own Purchase History
// ─────────────────────────────────────────────────────────────
const getUserPurchaseHistory = async (userId) => {
  const { data, error } = await supabase
    .from('user_purchases')
    .select(`
      id,
      transaction_id,
      platform,
      amount_paid,
      currency,
      cards_received,
      status,
      purchased_at,
      completed_at,
      bundle_id,
      plan_id,
      bundles   ( name, cover_image_url ),
      bundle_plans ( name, price, card_count )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('purchased_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};


module.exports = {
  selectCardsForUser,
  processWebhookPurchase,
  getUserPurchaseHistory,
  mockBypassPurchase,
};
