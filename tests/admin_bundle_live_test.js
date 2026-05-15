/**
 * @file   admin_bundle_live_test.js
 * @desc   Full live test for all Admin + Bundle Store APIs against AWS server.
 *         Runs sequentially and saves created IDs for chained tests.
 */

'use strict';

const axios = require('axios');

const BASE_URL = 'http://54.91.119.137:3000/api/v1';
const ADMIN_CREDS = { email: 'admin@elevora.com', password: 'admin123' };

let adminToken = '';

// IDs saved from create calls, used in update/delete tests
let createdQuestionId   = '';
let createdCategoryId   = '';
let createdCardId       = '';
let createdBundleId     = '';
let createdPlanId       = '';

// Counters
let passed = 0;
let failed = 0;
const failures = [];

// ─── Helper ───────────────────────────────────────────────────
const ok  = (name) => { passed++; console.log(`  ✔  PASS  | ${name}`); };
const fail = (name, err) => {
  failed++;
  const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Unknown error';
  const status = err?.response?.status || 'NO_RESPONSE';
  failures.push({ name, status, msg });
  console.log(`  ✘  FAIL  | ${name} → [${status}] ${msg}`);
};

const section = (title) => console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);

// ─────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n🚀  ELEVORA FULL LIVE API TEST  →  ' + BASE_URL + '\n');

  // ── SETUP: Admin Login ─────────────────────────────────────
  section('SETUP: Admin Login');
  try {
    const res = await axios.post(`${BASE_URL}/admin/auth/login`, ADMIN_CREDS);
    adminToken = res.data.data.token;
    ok('POST /admin/auth/login');
  } catch (e) {
    fail('POST /admin/auth/login', e);
    console.log('\n❌  Cannot proceed without admin token. Aborting.\n');
    process.exit(1);
  }

  const authHeader = { headers: { Authorization: `Bearer ${adminToken}` } };

  // ── SECTION 1: Dashboard ───────────────────────────────────
  section('SECTION 1: Dashboard Stats');
  try {
    const res = await axios.get(`${BASE_URL}/admin/dashboard/stats`, authHeader);
    if (!res.data.data.stats) throw new Error('Missing stats object');
    ok('GET /admin/dashboard/stats');
  } catch (e) { fail('GET /admin/dashboard/stats', e); }

  // ── SECTION 2: Categories ──────────────────────────────────
  section('SECTION 2: Categories Management');

  try {
    const res = await axios.get(`${BASE_URL}/admin/dashboard/categories`, authHeader);
    if (!Array.isArray(res.data.data.categories)) throw new Error('Expected array');
    ok(`GET /admin/dashboard/categories (${res.data.data.categories.length} found)`);
  } catch (e) { fail('GET /admin/dashboard/categories', e); }

  try {
    const res = await axios.post(`${BASE_URL}/admin/dashboard/categories`, {
      name: `TEST_CAT_${Date.now()}`,
      description: 'Live test category',
      theme_color: '#FF5733',
      order_index: 99
    }, authHeader);
    createdCategoryId = res.data.data.category.id;
    ok(`POST /admin/dashboard/categories → id: ${createdCategoryId}`);
  } catch (e) { fail('POST /admin/dashboard/categories', e); }

  if (createdCategoryId) {
    try {
      const res = await axios.put(`${BASE_URL}/admin/dashboard/categories/${createdCategoryId}`,
        { name: 'TEST_CAT_UPDATED', is_active: false }, authHeader);
      if (!res.data.data.category) throw new Error('No category returned');
      ok(`PUT /admin/dashboard/categories/:id`);
    } catch (e) { fail('PUT /admin/dashboard/categories/:id', e); }

    try {
      await axios.delete(`${BASE_URL}/admin/dashboard/categories/${createdCategoryId}`, authHeader);
      ok(`DELETE /admin/dashboard/categories/:id`);
    } catch (e) { fail('DELETE /admin/dashboard/categories/:id', e); }
  }

  // ── SECTION 3: Cards ───────────────────────────────────────
  section('SECTION 3: Cards Management');

  try {
    const res = await axios.get(`${BASE_URL}/admin/dashboard/cards`, authHeader);
    if (!Array.isArray(res.data.data.cards)) throw new Error('Expected array');
    ok(`GET /admin/dashboard/cards (${res.data.data.cards.length} found)`);
  } catch (e) { fail('GET /admin/dashboard/cards', e); }

  // Need a valid category to create a card — fetch first one
  let validCategoryId = '';
  try {
    const catRes = await axios.get(`${BASE_URL}/admin/dashboard/categories`, authHeader);
    const activeCat = catRes.data.data.categories.find(c => c.is_active);
    if (activeCat) validCategoryId = activeCat.id;
  } catch (e) {}

  if (validCategoryId) {
    try {
      const res = await axios.post(`${BASE_URL}/admin/dashboard/cards`, {
        category_id: validCategoryId,
        name: `TEST_CARD_${Date.now()}`,
        power_description: 'Live test card description.',
        card_type: 'ACTION'
      }, authHeader);
      createdCardId = res.data.data.card.id;
      ok(`POST /admin/dashboard/cards → id: ${createdCardId}`);
    } catch (e) { fail('POST /admin/dashboard/cards', e); }

    if (createdCardId) {
      try {
        await axios.put(`${BASE_URL}/admin/dashboard/cards/${createdCardId}`,
          { name: 'TEST_CARD_UPDATED', is_active: false }, authHeader);
        ok(`PUT /admin/dashboard/cards/:id`);
      } catch (e) { fail('PUT /admin/dashboard/cards/:id', e); }

      try {
        await axios.delete(`${BASE_URL}/admin/dashboard/cards/${createdCardId}`, authHeader);
        ok(`DELETE /admin/dashboard/cards/:id`);
      } catch (e) { fail('DELETE /admin/dashboard/cards/:id', e); }
    }
  } else {
    console.log('  ⚠  SKIP  | Card create/update/delete — no active category found');
  }

  // ── SECTION 4: Questions ───────────────────────────────────
  section('SECTION 4: Questions Management');

  try {
    const res = await axios.get(`${BASE_URL}/admin/dashboard/questions`, authHeader);
    if (!Array.isArray(res.data.data.questions)) throw new Error('Expected array');
    ok(`GET /admin/dashboard/questions (${res.data.data.questions.length} found)`);
  } catch (e) { fail('GET /admin/dashboard/questions', e); }

  try {
    const res = await axios.post(`${BASE_URL}/admin/dashboard/questions`, {
      text: `Live test question ${Date.now()}?`,
      input_type: 'SINGLE_CHOICE',
      options: ['Option A', 'Option B', 'Option C']
    }, authHeader);
    createdQuestionId = res.data.data.question.id;
    ok(`POST /admin/dashboard/questions → id: ${createdQuestionId}`);
  } catch (e) { fail('POST /admin/dashboard/questions', e); }

  if (createdQuestionId) {
    try {
      await axios.put(`${BASE_URL}/admin/dashboard/questions/${createdQuestionId}`,
        { text: 'Updated test question?', is_active: false }, authHeader);
      ok(`PUT /admin/dashboard/questions/:id`);
    } catch (e) { fail('PUT /admin/dashboard/questions/:id', e); }

    try {
      await axios.delete(`${BASE_URL}/admin/dashboard/questions/${createdQuestionId}`, authHeader);
      ok(`DELETE /admin/dashboard/questions/:id`);
    } catch (e) { fail('DELETE /admin/dashboard/questions/:id', e); }
  }

  // ── SECTION 5: Bundles ─────────────────────────────────────
  section('SECTION 5: Bundle Management');

  try {
    const res = await axios.get(`${BASE_URL}/admin/bundles`, authHeader);
    if (!Array.isArray(res.data.data.bundles)) throw new Error('Expected array');
    ok(`GET /admin/bundles (${res.data.data.bundles.length} found)`);
  } catch (e) { fail('GET /admin/bundles', e); }

  try {
    const res = await axios.post(`${BASE_URL}/admin/bundles`, {
      name: `TEST_BUNDLE_${Date.now()}`,
      description: 'Live test bundle',
      cover_image_url: 'https://example.com/img.jpg'
    }, authHeader);
    createdBundleId = res.data.data.bundle.id;
    ok(`POST /admin/bundles → id: ${createdBundleId}`);
  } catch (e) { fail('POST /admin/bundles', e); }

  if (createdBundleId) {
    try {
      const res = await axios.get(`${BASE_URL}/admin/bundles/${createdBundleId}`, authHeader);
      if (!res.data.data.bundle) throw new Error('No bundle returned');
      ok(`GET /admin/bundles/:id`);
    } catch (e) { fail('GET /admin/bundles/:id', e); }

    try {
      await axios.put(`${BASE_URL}/admin/bundles/${createdBundleId}`,
        { name: 'TEST_BUNDLE_UPDATED' }, authHeader);
      ok(`PUT /admin/bundles/:id`);
    } catch (e) { fail('PUT /admin/bundles/:id', e); }

    // ── Bundle Cards ────────────────────────────────────────
    section('SECTION 6: Bundle Cards Management');

    // Need active cards to add — re-fetch list
    let cardIdsToAdd = [];
    try {
      const cardsRes = await axios.get(`${BASE_URL}/admin/dashboard/cards`, authHeader);
      cardIdsToAdd = cardsRes.data.data.cards.filter(c => c.is_active).slice(0, 3).map(c => c.id);
    } catch (e) {}

    if (cardIdsToAdd.length > 0) {
      try {
        const res = await axios.post(`${BASE_URL}/admin/bundles/${createdBundleId}/cards`,
          { card_ids: cardIdsToAdd }, authHeader);
        ok(`POST /admin/bundles/:id/cards (added ${cardIdsToAdd.length} cards)`);
      } catch (e) { fail('POST /admin/bundles/:id/cards', e); }

      try {
        const res = await axios.get(`${BASE_URL}/admin/bundles/${createdBundleId}/cards`, authHeader);
        if (!Array.isArray(res.data.data.cards)) throw new Error('Expected array');
        ok(`GET /admin/bundles/:id/cards (${res.data.data.cards.length} cards)`);
      } catch (e) { fail('GET /admin/bundles/:id/cards', e); }

      try {
        await axios.delete(`${BASE_URL}/admin/bundles/${createdBundleId}/cards/${cardIdsToAdd[0]}`, authHeader);
        ok(`DELETE /admin/bundles/:id/cards/:cardId`);
      } catch (e) { fail('DELETE /admin/bundles/:id/cards/:cardId', e); }
    } else {
      console.log('  ⚠  SKIP  | Bundle cards — no active cards found');
    }

    // ── Bundle Plans ────────────────────────────────────────
    section('SECTION 7: Bundle Plans Management');

    try {
      const res = await axios.post(`${BASE_URL}/admin/bundles/${createdBundleId}/plans`, {
        name: 'Starter',
        price: 10.00,
        card_count: 5
      }, authHeader);
      createdPlanId = res.data.data.plan.id;
      ok(`POST /admin/bundles/:id/plans → id: ${createdPlanId}`);
    } catch (e) { fail('POST /admin/bundles/:id/plans', e); }

    try {
      const res = await axios.get(`${BASE_URL}/admin/bundles/${createdBundleId}/plans`, authHeader);
      if (!Array.isArray(res.data.data.plans)) throw new Error('Expected array');
      ok(`GET /admin/bundles/:id/plans (${res.data.data.plans.length} plan(s))`);
    } catch (e) { fail('GET /admin/bundles/:id/plans', e); }

    if (createdPlanId) {
      try {
        const res = await axios.get(`${BASE_URL}/admin/plans/${createdPlanId}`, authHeader);
        if (!res.data.data.plan) throw new Error('No plan returned');
        ok(`GET /admin/plans/:planId`);
      } catch (e) { fail('GET /admin/plans/:planId', e); }

      try {
        await axios.put(`${BASE_URL}/admin/plans/${createdPlanId}`,
          { price: 15.00, card_count: 8 }, authHeader);
        ok(`PUT /admin/plans/:planId`);
      } catch (e) { fail('PUT /admin/plans/:planId', e); }

      try {
        await axios.delete(`${BASE_URL}/admin/plans/${createdPlanId}`, authHeader);
        ok(`DELETE /admin/plans/:planId`);
      } catch (e) { fail('DELETE /admin/plans/:planId', e); }
    }

    // Final: soft-delete test bundle
    try {
      await axios.delete(`${BASE_URL}/admin/bundles/${createdBundleId}`, authHeader);
      ok(`DELETE /admin/bundles/:id (soft-delete)`);
    } catch (e) { fail('DELETE /admin/bundles/:id', e); }
  }

  // ── SECTION 8: User Store ──────────────────────────────────
  section('SECTION 8: User Store APIs');

  // Login as regular user to test store
  let userToken = '';
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'nikhilbhor201@gmail.com',
      password: 'securepassword123'
    });
    userToken = res.data.data.accessToken;
    ok('GET user token for store tests');
  } catch (e) { fail('User login for store tests', e); }

  if (userToken) {
    const userAuth = { headers: { Authorization: `Bearer ${userToken}` } };
    try {
      const res = await axios.get(`${BASE_URL}/store/bundles`, userAuth);
      if (!Array.isArray(res.data.data.bundles)) throw new Error('Expected array');
      ok(`GET /store/bundles (${res.data.data.bundles.length} active bundle(s))`);
    } catch (e) { fail('GET /store/bundles', e); }
  }

  // ── FINAL REPORT ───────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊  FINAL REPORT`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅  Passed : ${passed}`);
  console.log(`  ❌  Failed : ${failed}`);
  console.log(`  📝  Total  : ${passed + failed}`);

  if (failures.length > 0) {
    console.log(`\n  ⚠️  FAILED TESTS:`);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.status}] ${f.name}\n     → ${f.msg}`);
    });
  } else {
    console.log(`\n  🎉  ALL TESTS PASSED! Backend is fully operational.`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

runTests().catch(console.error);
