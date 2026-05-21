/**
 * @file   bundleService.js
 * @desc   Data-access layer for the Bundle Store feature.
 *         Covers Admin CRUD (bundles, bundle cards, bundle plans)
 *         and the User-facing Store queries.
 *
 * Design decisions:
 *  - Every mutating operation returns the affected row(s) so the
 *    controller can relay the fresh data back to the client.
 *  - Errors always include an HTTP `status` property so the global
 *    error handler can respond with the right status code.
 *  - The store read queries use `v_store_bundles` view for efficiency.
 */

'use strict';

const { supabase } = require('../db/supabase');

// ─────────────────────────────────────────────────────────────
// Helper: Throw a standardised error with HTTP status attached
// ─────────────────────────────────────────────────────────────
const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// SECTION A: Admin — Bundle CRUD
// ─────────────────────────────────────────────────────────────

/**
 * Create a brand-new bundle.
 * @param {object} data - { name, description?, cover_image_url? }
 */
const createBundle = async (data) => {
  const { name, description, cover_image_url } = data;

  const { data: bundle, error } = await supabase
    .from('bundles')
    .insert([{ name, description, cover_image_url }])
    .select()
    .single();

  if (error) throwError(error.message, 400);
  return bundle;
};

/**
 * Return ALL bundles (active + inactive) for the admin dashboard.
 * Includes a card count and plan count per bundle.
 */
const getAllBundlesAdmin = async () => {
  const { data, error } = await supabase
    .from('bundles')
    .select(`
      id,
      name,
      description,
      cover_image_url,
      is_active,
      created_at,
      updated_at,
      bundle_cards ( count ),
      bundle_plans ( count )
    `)
    .order('created_at', { ascending: false });

  if (error) throwError(error.message, 400);
  return data;
};

/**
 * Return a single bundle by ID (admin view — includes all cards & plans).
 * @param {string} bundleId - UUID
 */
const getBundleByIdAdmin = async (bundleId) => {
  const { data, error } = await supabase
    .from('bundles')
    .select(`
      id,
      name,
      description,
      cover_image_url,
      is_active,
      created_at,
      updated_at,
      bundle_cards (
        id,
        card_id,
        added_at,
        cards ( id, name, card_type, power_description, is_active )
      ),
      bundle_plans (
        id,
        name,
        price,
        card_count,
        is_active,
        created_at
      )
    `)
    .eq('id', bundleId)
    .single();

  if (error) throwError('Bundle not found.', 404);
  return data;
};

/**
 * Update a bundle's metadata (name, description, image, active state).
 * @param {string} bundleId - UUID
 * @param {object} data     - Partial bundle fields to update
 */
const updateBundle = async (bundleId, data) => {
  const { name, description, cover_image_url, is_active } = data;

  const { data: bundle, error } = await supabase
    .from('bundles')
    .update({ name, description, cover_image_url, is_active })
    .eq('id', bundleId)
    .select()
    .single();

  if (error) throwError(error.message, 400);
  if (!bundle) throwError('Bundle not found.', 404);
  return bundle;
};

/**
 * Soft-delete a bundle by setting is_active = false.
 * Hard-deletes are intentionally not exposed to prevent data loss.
 * @param {string} bundleId - UUID
 */
const softDeleteBundle = async (bundleId) => {
  const { data, error } = await supabase
    .from('bundles')
    .update({ is_active: false })
    .eq('id', bundleId)
    .select()
    .single();

  if (error) throwError(error.message, 400);
  if (!data) throwError('Bundle not found.', 404);
  return data;
};


// ─────────────────────────────────────────────────────────────
// SECTION B: Admin — Bundle Cards management
// ─────────────────────────────────────────────────────────────

/**
 * Bulk-attach an array of card UUIDs to a bundle.
 * Silently ignores duplicates (ON CONFLICT DO NOTHING).
 * @param {string}   bundleId - UUID
 * @param {string[]} cardIds  - Array of card UUIDs
 */
const addCardsToBunde = async (bundleId, cardIds) => {
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    throwError('card_ids must be a non-empty array.', 400);
  }

  const rows = cardIds.map((card_id) => ({ bundle_id: bundleId, card_id }));

  const { data, error } = await supabase
    .from('bundle_cards')
    .upsert(rows, { onConflict: 'bundle_id,card_id', ignoreDuplicates: true })
    .select();

  if (error) throwError(error.message, 400);
  return data;
};

/**
 * Remove a single card from a bundle.
 * @param {string} bundleId - UUID
 * @param {string} cardId   - UUID
 */
const removeCardFromBundle = async (bundleId, cardId) => {
  const { data, error } = await supabase
    .from('bundle_cards')
    .delete()
    .eq('bundle_id', bundleId)
    .eq('card_id', cardId)
    .select()
    .single();

  if (error || !data) throwError('Card not found in this bundle.', 404);
  return data;
};


// ─────────────────────────────────────────────────────────────
// SECTION C: Admin — Bundle Plans management
// ─────────────────────────────────────────────────────────────

/**
 * Create a pricing plan for a bundle.
 * AUTO-GENERATES store_product_id and saves to store_products for both
 * iOS and Android so admin never has to map products manually.
 * @param {string} bundleId - UUID
 * @param {object} data     - { name, price, card_count }
 */
const createBundlePlan = async (bundleId, data) => {
  const { name, price, card_count } = data;

  // Fetch bundle name for ID generation
  const { data: bundle, error: bundleErr } = await supabase
    .from('bundles')
    .select('name')
    .eq('id', bundleId)
    .single();

  if (bundleErr || !bundle) throwError('Bundle not found.', 404);

  // Auto-generate the store product ID
  const slugify = (str) => str.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const storeProductId = `elevora.${slugify(bundle.name)}.${slugify(name)}`;

  // Create the plan
  const { data: plan, error } = await supabase
    .from('bundle_plans')
    .insert([{ bundle_id: bundleId, name, price, card_count }])
    .select()
    .single();

  if (error) throwError(error.message, 400);

  // Auto-save store product mappings for BOTH platforms
  // NOTE: We check error here — if this silently fails the webhook
  // will later return "Unknown product" which is very hard to debug.
  const { error: spErr } = await supabase.from('store_products').insert([
    { plan_id: plan.id, platform: 'ios',     store_product_id: storeProductId },
    { plan_id: plan.id, platform: 'android', store_product_id: storeProductId },
  ]);

  if (spErr) {
    console.error('[createBundlePlan] store_products insert failed:', spErr.message);
    throwError(`Plan created but store product mapping failed: ${spErr.message}`, 500);
  }

  return { ...plan, store_product_id: storeProductId };
};


/**
 * Update a pricing plan (name, price, card_count, is_active).
 * @param {string} planId - UUID
 * @param {object} data   - Partial plan fields to update
 */
const updateBundlePlan = async (planId, data) => {
  const { name, price, card_count, is_active } = data;

  const { data: plan, error } = await supabase
    .from('bundle_plans')
    .update({ name, price, card_count, is_active })
    .eq('id', planId)
    .select()
    .single();

  if (error) throwError(error.message, 400);
  if (!plan) throwError('Plan not found.', 404);
  return plan;
};

/**
 * Hard-delete a pricing plan.
 * Safe to hard-delete plans as they have no user purchase references yet.
 * @param {string} planId - UUID
 */
const deleteBundlePlan = async (planId) => {
  const { data, error } = await supabase
    .from('bundle_plans')
    .delete()
    .eq('id', planId)
    .select()
    .single();

  if (error || !data) throwError('Plan not found.', 404);
  return data;
};


// ─────────────────────────────────────────────────────────────
// SECTION D: User Store — Read-only queries
// ─────────────────────────────────────────────────────────────

/**
 * Return all active bundles with aggregated card count + active plans.
 * Uses the v_store_bundles view for a single, fast query.
 */
const getStoreBundles = async () => {
  const { data, error } = await supabase
    .from('v_store_bundles')
    .select('*');

  if (error) throwError(error.message, 400);
  return data;
};

/**
 * Return one active bundle — plans always included.
 * Cards are included ONLY if bundle.show_cards_in_store = true.
 * @param {string} bundleId - UUID
 */
const getStoreBundleById = async (bundleId) => {
  // Fetch bundle + the show_cards_in_store flag
  const { data: bundle, error: bundleErr } = await supabase
    .from('bundles')
    .select('id, name, description, cover_image_url, show_cards_in_store, created_at')
    .eq('id', bundleId)
    .eq('is_active', true)
    .single();

  if (bundleErr || !bundle) throwError('Bundle not found or unavailable.', 404);

  // Always fetch active plans
  const { data: plans, error: planErr } = await supabase
    .from('bundle_plans')
    .select('id, name, price, card_count')
    .eq('bundle_id', bundleId)
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (planErr) throwError(planErr.message, 400);

  // Fetch card count for display (always show total count)
  const { count: totalCards } = await supabase
    .from('bundle_cards')
    .select('*', { count: 'exact', head: true })
    .eq('bundle_id', bundleId);

  // Only include card list if admin has enabled the flag for this bundle
  let cards = [];
  if (bundle.show_cards_in_store) {
    const { data: bundleCards, error: cardErr } = await supabase
      .from('bundle_cards')
      .select(`
        cards (
          id, name, card_type, power_description, image_url,
          card_categories ( name, theme_color )
        )
      `)
      .eq('bundle_id', bundleId);

    if (!cardErr) cards = bundleCards.map((bc) => bc.cards).filter(Boolean);
  }

  const { show_cards_in_store, ...bundleData } = bundle;

  return {
    ...bundleData,
    total_cards: totalCards || 0,
    plans,
    ...(bundle.show_cards_in_store && { cards }),
  };
};



module.exports = {
  // Admin — Bundles
  createBundle,
  getAllBundlesAdmin,
  getBundleByIdAdmin,
  updateBundle,
  softDeleteBundle,

  // Admin — Bundle Cards
  addCardsToBunde,
  removeCardFromBundle,

  // Admin — Bundle Plans
  createBundlePlan,
  updateBundlePlan,
  deleteBundlePlan,

  // User Store
  getStoreBundles,
  getStoreBundleById,
};
