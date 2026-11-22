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

  // ── Room-Only Economy ─────────────────────────────────────
  // User MUST be inside an ACTIVE 30-DAY room at the time of purchase.
  // 7-day free rooms CANNOT purchase bundles.
  // Room must also have partner connected (ACTIVE status with partner_id).
  const { data: activeRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('id, expiry_type, status, partner_id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .eq('status', 'ACTIVE')
    .not('partner_id', 'is', null)
    .maybeSingle();

  if (roomErr || !activeRoom) {
    throwError('You must be inside an active couple room with your partner to purchase cards.', 403);
  }

  if (activeRoom.expiry_type !== '30_DAYS') {
    throwError('Card bundles are exclusive to 30-Day VIP Rooms. Please upgrade to a 30-day room with your partner.', 403);
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
  // User MUST be inside an ACTIVE 30-DAY room at the time of purchase.
  const { data: activeRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('id, expiry_type, status, partner_id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .eq('status', 'ACTIVE')
    .not('partner_id', 'is', null)
    .maybeSingle();

  if (roomErr || !activeRoom) {
    throwError('You must be inside an active couple room with your partner to purchase cards.', 403);
  }

  if (activeRoom.expiry_type !== '30_DAYS') {
    throwError('Card bundles are exclusive to 30-Day VIP Rooms. Please upgrade to a 30-day room with your partner.', 403);
  }
  const activeRoomId = activeRoom.id;

  const { data: plan, error: planErr } = await supabase
    .from('bundle_plans')
    .select('price, card_count')
    .eq('id', planId)
    .single();

  if (planErr || !plan) throwError('Invalid plan ID.', 400);

  const { data: storeProd } = await supabase
    .from('store_products')
    .select('store_product_id')
    .eq('plan_id', planId)
    .maybeSingle();

  const resolvedStoreProductId = storeProd?.store_product_id || 'bundle_spicy_10';

  const transactionId = `AMZN-${Math.floor(100000 + Math.random() * 900000)}-${Date.now()}`;

  const { data: purchase, error: purchaseErr } = await supabase
    .from('user_purchases')
    .upsert([{
      user_id:          userId,
      bundle_id:        bundleId,
      plan_id:          planId,
      transaction_id:   transactionId,
      platform:         'android',
      store_product_id: resolvedStoreProductId,
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
  
  if (selectedCardIds.length > 0) {
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


/**
 * Activate VIP Membership for a user (Monthly ₹99 or Yearly)
 * Creates / updates subscription and adds to purchase ledger
 */
const activateMembershipPurchase = async ({ userId, planId = 'monthly', productId = 'soulshuffle_monthly_99', paymentSource = 'google_play', transactionId = null }) => {
  if (!userId) throwError('User ID is required to activate membership', 400);

  const durationDays = planId === 'yearly' ? 365 : 30;
  const price = planId === 'yearly' ? 499 : 99;
  const now = new Date();
  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const txId = transactionId || `TXN-VIP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Check for any current active room where user is host or partner
  const { data: activeRoom } = await supabase
    .from('rooms')
    .select('id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .in('status', ['WAITING', 'ACTIVE'])
    .maybeSingle();

  // 2. Persist VIP membership directly on user profile preferences (guaranteed, room-agnostic)
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();

    const existingPrefs = (profile && profile.preferences) ? profile.preferences : {};
    const updatedPrefs = {
      ...existingPrefs,
      is_vip: true,
      vip_active: true,
      vip_expires_at: endsAt.toISOString(),
      vip_product_id: productId,
      vip_plan_id: planId,
      vip_updated_at: now.toISOString(),
    };

    await supabase
      .from('profiles')
      .update({ preferences: updatedPrefs })
      .eq('id', userId);
  } catch (profErr) {
    console.warn('[Membership] Profile preferences update warning:', profErr.message);
  }

  // 3. Insert subscription (if active room exists, or if schema permits)
  try {
    await supabase
      .from('subscriptions')
      .insert([{
        room_id: activeRoom ? activeRoom.id : null,
        payer_id: userId,
        store_product_id: productId,
        payment_source: paymentSource,
        status: 'active',
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        current_season: 1,
        autopay_status: 'active',
      }]);
  } catch (subErr) {
    console.warn('[Membership] Subscription insert warning:', subErr.message);
  }

  // 4. Record in user_purchases ledger
  try {
    await supabase
      .from('user_purchases')
      .insert([{
        user_id: userId,
        transaction_id: txId,
        platform: paymentSource === 'google_play' ? 'android' : 'ios',
        store_product_id: productId,
        amount_paid: price,
        currency: 'INR',
        status: 'completed',
        purchased_at: now.toISOString(),
        completed_at: now.toISOString(),
      }]);
  } catch (pErr) {
    console.warn('[Membership] user_purchases insert warning:', pErr.message);
  }

  // 5. If there's an active room, mark mode = 'paid'
  if (activeRoom) {
    await supabase
      .from('rooms')
      .update({ mode: 'paid' })
      .eq('id', activeRoom.id);
  }

  return {
    success: true,
    vip_active: true,
    plan_id: planId,
    product_id: productId,
    duration_days: durationDays,
    expires_at: endsAt.toISOString(),
    transaction_id: txId,
  };
};

/**
 * Check if a user currently has an active VIP membership
 */
const checkUserVipStatus = async (userId) => {
  if (!userId) return { is_vip: false };

  const nowIso = new Date().toISOString();

  // 1. Check user profile preferences (instant, room-agnostic check)
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();

    if (profile?.preferences?.is_vip && profile?.preferences?.vip_expires_at) {
      const expDate = new Date(profile.preferences.vip_expires_at);
      if (expDate > new Date()) {
        return {
          is_vip: true,
          expires_at: profile.preferences.vip_expires_at,
          product_id: profile.preferences.vip_product_id || 'soulshuffle_monthly_99',
        };
      }
    }
  } catch (profCheckErr) {
    console.warn('[Membership] Profile VIP check notice:', profCheckErr.message);
  }

  // 2. Check subscriptions table
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, ends_at, status, store_product_id')
    .eq('payer_id', userId)
    .eq('status', 'active')
    .gt('ends_at', nowIso)
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    return {
      is_vip: true,
      subscription_id: sub.id,
      expires_at: sub.ends_at,
      product_id: sub.store_product_id,
    };
  }

  // 3. Check recent completed user_purchases strictly for VIP / Membership products
  const VIP_PRODUCT_IDS = [
    'soulshuffle_monthly_99',
    'soulshuffle_pro_monthly',
    'soulshuffle_pro_annual',
    'soulshuffle_vip_monthly',
  ];

  const { data: purchase } = await supabase
    .from('user_purchases')
    .select('id, purchased_at, store_product_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('store_product_id', VIP_PRODUCT_IDS)
    .order('purchased_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (purchase && purchase.purchased_at) {
    const purchaseDate = new Date(purchase.purchased_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (purchaseDate > thirtyDaysAgo) {
      return {
        is_vip: true,
        purchase_id: purchase.id,
        expires_at: new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        product_id: purchase.store_product_id,
      };
    }
  }

  return { is_vip: false };
};

module.exports = {
  selectCardsForUser,
  processWebhookPurchase,
  getUserPurchaseHistory,
  mockBypassPurchase,
  activateMembershipPurchase,
  checkUserVipStatus,
};
