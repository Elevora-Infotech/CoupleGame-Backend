/**
 * @file   adminPurchaseService.js
 * @desc   Admin-side service for purchase management, revenue analytics,
 *         refunds, manual card grants, user deck audit, and store products.
 */

'use strict';

const { supabase }           = require('../db/supabase');
const { selectCardsForUser } = require('./purchaseService');
const { v4: uuidv4 }         = require('uuid');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// A: Get All Purchases (Paginated + Filtered)
// Admin can filter by: status, platform, bundle_id, user_id, date range
// ─────────────────────────────────────────────────────────────
const getAllPurchases = async (filters = {}) => {
  const {
    page = 1, limit = 20,
    status, platform, bundle_id, user_id,
    from_date, to_date,
  } = filters;

  const offset = (page - 1) * limit;

  let query = supabase
    .from('user_purchases')
    .select(`
      id, transaction_id, platform, amount_paid, currency,
      cards_received, status, purchased_at, completed_at, admin_note,
      user_id,
      bundles   ( id, name ),
      bundle_plans ( id, name, price, card_count )
    `, { count: 'exact' })
    .order('purchased_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)    query = query.eq('status', status);
  if (platform)  query = query.eq('platform', platform);
  if (bundle_id) query = query.eq('bundle_id', bundle_id);
  if (user_id)   query = query.eq('user_id', user_id);
  if (from_date) query = query.gte('purchased_at', from_date);
  if (to_date)   query = query.lte('purchased_at', to_date);

  const { data, error, count } = await query;
  if (error) throwError(error.message, 400);

  return {
    purchases: data,
    pagination: { page: +page, limit: +limit, total: count,
                  pages: Math.ceil(count / limit) },
  };
};

// ─────────────────────────────────────────────────────────────
// B: Get One Purchase — Deep Detail (cards received included)
// ─────────────────────────────────────────────────────────────
const getPurchaseById = async (purchaseId) => {
  const { data: purchase, error } = await supabase
    .from('user_purchases')
    .select(`
      id, transaction_id, platform, amount_paid, currency,
      cards_received, status, purchased_at, completed_at, admin_note,
      user_id,
      bundles   ( id, name, cover_image_url ),
      bundle_plans ( id, name, price, card_count )
    `)
    .eq('id', purchaseId)
    .single();

  if (error || !purchase) throwError('Purchase not found.', 404);

  // Fetch the exact cards the user received from this purchase
  const { data: cards } = await supabase
    .from('v_user_deck_detail')
    .select('deck_card_id, card_id, card_name, card_type, is_used, expired, used_at, room_id')
    .eq('purchase_id', purchaseId);

  return { ...purchase, cards_detail: cards || [] };
};

// ─────────────────────────────────────────────────────────────
// C: Get All Purchases by One User (support lookup)
// ─────────────────────────────────────────────────────────────
const getPurchasesByUser = async (userId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('user_purchases')
    .select(`
      id, transaction_id, platform, amount_paid, cards_received,
      status, purchased_at,
      bundles ( name ), bundle_plans ( name, price )
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('purchased_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throwError(error.message, 400);
  return { purchases: data,
           pagination: { page: +page, limit: +limit, total: count } };
};

// ─────────────────────────────────────────────────────────────
// D: Revenue Analytics
// Returns aggregated stats for a date range
// ─────────────────────────────────────────────────────────────
const getPurchaseStats = async (fromDate, toDate) => {
  let query = supabase
    .from('user_purchases')
    .select('id, amount_paid, cards_received, platform, bundle_id, bundles(name)')
    .eq('status', 'completed');

  if (fromDate) query = query.gte('purchased_at', fromDate);
  if (toDate)   query = query.lte('purchased_at', toDate);

  const { data, error } = await query;
  if (error) throwError(error.message, 400);

  // Aggregate in application layer
  const total_revenue   = data.reduce((s, r) => s + Number(r.amount_paid),    0);
  const total_purchases = data.length;
  const total_cards     = data.reduce((s, r) => s + (r.cards_received || 0),  0);
  const avg_value       = total_purchases ? (total_revenue / total_purchases) : 0;

  // By platform
  const by_platform = data.reduce((acc, r) => {
    if (!acc[r.platform]) acc[r.platform] = { purchases: 0, revenue: 0 };
    acc[r.platform].purchases += 1;
    acc[r.platform].revenue   += Number(r.amount_paid);
    return acc;
  }, {});

  // By bundle
  const bundleMap = {};
  data.forEach(r => {
    const name = r.bundles?.name || r.bundle_id;
    if (!bundleMap[name]) bundleMap[name] = { bundle_name: name, purchases: 0, revenue: 0 };
    bundleMap[name].purchases += 1;
    bundleMap[name].revenue   += Number(r.amount_paid);
  });
  const by_bundle = Object.values(bundleMap)
    .sort((a, b) => b.revenue - a.revenue);

  return {
    total_revenue:   +total_revenue.toFixed(2),
    total_purchases,
    total_cards_issued: total_cards,
    avg_purchase_value: +avg_value.toFixed(2),
    by_platform,
    by_bundle,
  };
};

// ─────────────────────────────────────────────────────────────
// E: Process Refund
// Marks purchase as refunded AND revokes all cards instantly.
// Irreversible operation — cards are hidden from user's deck.
// ─────────────────────────────────────────────────────────────
const processRefund = async (purchaseId, adminNote = '') => {
  // Confirm purchase exists and is refundable
  const { data: purchase, error } = await supabase
    .from('user_purchases')
    .select('id, status')
    .eq('id', purchaseId)
    .single();

  if (error || !purchase) throwError('Purchase not found.', 404);
  if (purchase.status === 'refunded') throwError('Purchase already refunded.', 409);
  if (purchase.status !== 'completed') throwError('Only completed purchases can be refunded.', 400);

  // Revoke all cards from this purchase
  const { error: revokeErr } = await supabase
    .from('user_card_deck')
    .update({
      expired:    true,
      is_visible: false,
      is_used:    true,
      used_at:    new Date().toISOString(),
    })
    .eq('purchase_id', purchaseId);

  if (revokeErr) throwError('Failed to revoke cards.', 500);

  // Mark purchase as refunded
  const { data: updated, error: updateErr } = await supabase
    .from('user_purchases')
    .update({
      status:      'refunded',
      admin_note:  adminNote,
      refunded_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .select()
    .single();

  if (updateErr) throwError('Failed to update purchase status.', 500);
  return updated;
};

// ─────────────────────────────────────────────────────────────
// F: Manually Grant Cards to a User (free, for support)
// Creates a purchase record with amount_paid = 0.00 and
// runs the same 80/20 algorithm so history stays consistent.
// ─────────────────────────────────────────────────────────────
const grantCardsToUser = async ({ user_id, bundle_id, card_count, room_id, reason }) => {
  if (!user_id || !bundle_id || !card_count) {
    throwError('user_id, bundle_id, and card_count are required.', 400);
  }

  // ── OPTION B: Room-Only Economy ───────────────────────────
  // A room_id is mandatory for admin grants as well.
  // Validate the room is still ACTIVE before stamping cards to it.
  if (!room_id) throwError('room_id is required for Option B (Room-Only Economy).', 400);

  const { data: activeRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', room_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (roomErr || !activeRoom) {
    throwError('The provided room_id is not an active room.', 400);
  }

  // Validate bundle exists
  const { data: bundle, error: bundleErr } = await supabase
    .from('bundles')
    .select('id, name, bundle_plans(id)')
    .eq('id', bundle_id)
    .single();

  if (bundleErr || !bundle) throwError('Bundle not found.', 404);

  // Create a zero-cost purchase record
  const transactionId = `MANUAL_GRANT_${uuidv4()}`;
  const { data: purchase, error: purchaseErr } = await supabase
    .from('user_purchases')
    .insert([{
      user_id,
      bundle_id,
      plan_id:          bundle.bundle_plans?.[0]?.id || bundle_id,
      transaction_id:   transactionId,
      platform:         'manual_grant',
      store_product_id: '',
      amount_paid:      0.00,
      currency:         'INR',
      cards_received:   0,
      status:           'pending',
      admin_note:       reason || 'Manual grant by admin',
    }])
    .select()
    .single();

  if (purchaseErr) throwError('Failed to create grant record.', 500);

  // Run 80/20 algorithm (same as real purchase)
  const selectedCardIds = await selectCardsForUser(user_id, bundle_id, card_count);
  if (!selectedCardIds.length) throwError('No cards available to grant.', 400);

  // Insert into deck — stamp room_id immediately (Option B)
  const deckRows = selectedCardIds.map(cardId => ({
    user_id,
    card_id:     cardId,
    purchase_id: purchase.id,
    bundle_id,
    room_id,     // ← Option B: locked to room from birth
  }));

  const { error: deckErr } = await supabase
    .from('user_card_deck')
    .insert(deckRows);

  if (deckErr) throwError('Failed to add cards to deck.', 500);

  // Complete the purchase record
  await supabase
    .from('user_purchases')
    .update({ status: 'completed', cards_received: selectedCardIds.length,
              completed_at: new Date().toISOString() })
    .eq('id', purchase.id);

  return { purchase_id: purchase.id, cards_granted: selectedCardIds.length };
};

// ─────────────────────────────────────────────────────────────
// G: View Any User's Card Deck (Admin Audit)
// ─────────────────────────────────────────────────────────────
const getUserDeckAdmin = async (userId, status = 'active') => {
  let query = supabase
    .from('v_user_deck_detail')
    .select('*')
    .eq('user_id', userId)
    .order('acquired_at', { ascending: false });

  if (status === 'active')  query = query.eq('expired', false);
  if (status === 'expired') query = query.eq('expired', true);
  // 'all' → no filter

  const { data, error } = await query;
  if (error) throwError(error.message, 400);
  return data;
};

// ─────────────────────────────────────────────────────────────
// H: Revoke a Specific Card from a User's Deck
// ─────────────────────────────────────────────────────────────
const revokeCard = async (userId, deckCardId, reason = '') => {
  const { data, error } = await supabase
    .from('user_card_deck')
    .update({ expired: true, is_visible: false, is_used: true,
              used_at: new Date().toISOString() })
    .eq('id', deckCardId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !data) throwError('Card not found in user deck.', 404);
  return data;
};

// ─────────────────────────────────────────────────────────────
// I: Store Products (RevenueCat product mappings)
// ─────────────────────────────────────────────────────────────
const getStoreProducts = async () => {
  const { data, error } = await supabase
    .from('store_products')
    .select(`
      id, platform, store_product_id, is_active, created_at,
      bundle_plans ( id, name, price, card_count, bundles(name) )
    `)
    .order('created_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

const createStoreProduct = async (data) => {
  const { plan_id, platform, store_product_id } = data;
  if (!plan_id || !platform || !store_product_id) {
    throwError('plan_id, platform, and store_product_id are required.', 400);
  }
  const { data: product, error } = await supabase
    .from('store_products')
    .insert([{ plan_id, platform, store_product_id }])
    .select().single();

  if (error) throwError(error.message, 400);
  return product;
};

const updateStoreProduct = async (id, { is_active }) => {
  const { data, error } = await supabase
    .from('store_products')
    .update({ is_active })
    .eq('id', id)
    .select().single();

  if (error || !data) throwError('Store product not found.', 404);
  return data;
};

const deleteStoreProduct = async (id) => {
  const { data, error } = await supabase
    .from('store_products')
    .delete()
    .eq('id', id)
    .select().single();

  if (error || !data) throwError('Store product not found.', 404);
  return data;
};

module.exports = {
  getAllPurchases,
  getPurchaseById,
  getPurchasesByUser,
  getPurchaseStats,
  processRefund,
  grantCardsToUser,
  getUserDeckAdmin,
  revokeCard,
  getStoreProducts,
  createStoreProduct,
  updateStoreProduct,
  deleteStoreProduct,
};
