'use strict';

/**
 * @file   dual_purchase_live_test.js
 * @desc   Dual-approach live test covering BOTH card grant methods:
 *
 *  APPROACH A: Real RevenueCat Webhook simulation
 *    - User is in an ACTIVE room
 *    - Fake webhook fires exactly like Apple/Google Pay would
 *    - Cards auto-allocated by 80/20 algorithm
 *
 *  APPROACH B: Admin Manual Grant
 *    - Admin grants cards to a user who is in an ACTIVE room
 *    - room_id is mandatory (Option B enforcement)
 *    - Same 80/20 algorithm runs
 *
 *  RULE: If ANY bug is found → STOP and report it. Do NOT auto-fix.
 */

const axios  = require('axios');
const { io } = require('socket.io-client');

const BASE           = 'http://localhost:3000/api/v1';
const SOCKET         = 'http://localhost:3000';
const WEBHOOK_SECRET = 'elevora_test_webhook_secret_2026';
const ADMIN          = { email: 'admin@elevora.com', password: 'admin123' };

// ─── Shared State ─────────────────────────────────────────────
let adminToken = '';
let bundleId   = '', plan1Id = '', storeProductId = '';
let cat1Id     = '';
const cardIds  = [];

// Partner A → RevenueCat webhook approach
let pA_token = '', pA_id = '', pA_email = '';
let roomA_id = '', roomA_code = '';

// Partner B → Admin grant approach
let pB1_token = '', pB1_id = '', pB1_email = '';
let pB2_token = '', pB2_email = '';
let roomB_id  = '', roomB_code = '';

// ─── Helpers ──────────────────────────────────────────────────
let passed = 0; let failed = 0; const bugs = [];

const ok   = (msg) => { passed++; console.log(`  ✔ PASS | ${msg}`); };
const bug  = (label, err) => {
  failed++;
  const msg    = err?.response?.data?.message
              || err?.response?.data?.error
              || err?.message
              || String(err);
  const status = err?.response?.status || 'NO_RESPONSE';
  bugs.push({ label, status, msg });
  console.log(`\n  ✘ BUG FOUND | ${label}`);
  console.log(`    HTTP    : ${status}`);
  console.log(`    Message : ${msg}`);
  console.log(`\n  ⛔ Test stopped. Fix this bug first — no auto-changes.\n`);
  printReport();
  process.exit(1);
};

const section = (t) => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${t}`);
  console.log(`${'─'.repeat(60)}`);
};

const printReport = () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 DUAL PURCHASE LIVE TEST REPORT`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅ Passed : ${passed}`);
  console.log(`  ❌ Bugs   : ${failed}`);
  if (bugs.length) {
    console.log(`\n  🐛 BUGS TO FIX (report to dev before changing code):`);
    bugs.forEach((b, i) =>
      console.log(`\n  ${i+1}. [HTTP ${b.status}] ${b.label}\n     → ${b.msg}`));
  } else {
    console.log(`\n  🎉 ALL TESTS PASSED — Both purchase approaches are operational!`);
  }
  console.log(`${'═'.repeat(60)}\n`);
};

const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
const ts   = Date.now();

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function run() {
  console.log('\n🚀 ELEVORA DUAL PURCHASE LIVE TEST');
  console.log('   Approach A: RevenueCat Webhook  |  Approach B: Admin Grant');
  console.log(`   Target: ${BASE}\n`);

  // ────────────────────────────────────────────────────────────
  section('SHARED SETUP 1: Admin Login');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.post(`${BASE}/admin/auth/login`, ADMIN);
    adminToken = r.data.data.token;
    ok('Admin logged in');
  } catch (e) { bug('Admin login', e); }

  // ────────────────────────────────────────────────────────────
  section('SHARED SETUP 2: Category + 5 Cards + 1 Bundle + 1 Plan');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.post(`${BASE}/admin/dashboard/categories`,
      { name: `DualTest_${ts}`, description: 'Dual test category', theme_color: '#7C3AED', order_index: 1 },
      auth(adminToken));
    cat1Id = r.data.data.category.id;
    ok(`Category created → ${cat1Id}`);
  } catch (e) { bug('Create category', e); }

  const cardNames = ['Moonlight Walk', 'Secret Handshake', 'Sunrise Breakfast', 'Pillow Fort Night', 'Jazz Night In'];
  for (const name of cardNames) {
    try {
      const r = await axios.post(`${BASE}/admin/dashboard/cards`,
        { category_id: cat1Id, name, power_description: `Power: ${name}`, card_type: 'ACTION' },
        auth(adminToken));
      cardIds.push(r.data.data.card.id);
      ok(`Card created: "${name}"`);
    } catch (e) { bug(`Create card: ${name}`, e); }
  }

  try {
    const r = await axios.post(`${BASE}/admin/bundles`,
      { name: `DualBundle_${ts}`, description: 'Test bundle for dual approach', cover_image_url: 'https://example.com/dual.jpg' },
      auth(adminToken));
    bundleId = r.data.data.bundle.id;
    ok(`Bundle created → ${bundleId}`);
  } catch (e) { bug('Create bundle', e); }

  try {
    await axios.post(`${BASE}/admin/bundles/${bundleId}/cards`,
      { card_ids: cardIds }, auth(adminToken));
    ok(`${cardIds.length} cards added to bundle`);
  } catch (e) { bug('Add cards to bundle', e); }

  try {
    const r = await axios.post(`${BASE}/admin/bundles/${bundleId}/plans`,
      { name: 'Starter', price: 10.00, card_count: 5 }, auth(adminToken));
    plan1Id        = r.data.data.plan.id;
    storeProductId = r.data.data.plan.store_product_id;
    ok(`Plan created → ₹10 / 5 cards | store_product_id: ${storeProductId}`);
  } catch (e) { bug('Create bundle plan', e); }

  // ────────────────────────────────────────────────────────────
  section('APPROACH A — RevenueCat Webhook Purchase');
  section('A-1: Create User → Create Room → Partner Joins');
  // ────────────────────────────────────────────────────────────
  pA_email = `userA_${ts}@test.com`;
  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'User Alpha', email: pA_email, password: 'password123' });
    pA_token = r.data.data.accessToken;
    pA_id    = r.data.data.user.id;
    ok(`Approach A user created → ${pA_email}`);
  } catch (e) { bug('Create Approach A user', e); }

  // Partner for room A (just needs to exist and join)
  const pA2_email = `userA2_${ts}@test.com`;
  let pA2_token = '';
  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'User Alpha 2', email: pA2_email, password: 'password123' });
    pA2_token = r.data.data.accessToken;
    ok(`Approach A partner 2 created → ${pA2_email}`);
  } catch (e) { bug('Create Approach A partner 2', e); }

  try {
    const r = await axios.post(`${BASE}/rooms/create`, { expiry_type: '7_DAYS' }, auth(pA_token));
    roomA_id   = r.data.data.room.id;
    roomA_code = r.data.data.room.code;
    ok(`Room A created → ${roomA_code} | ID: ${roomA_id}`);
  } catch (e) { bug('Create room A', e); }

  try {
    const r = await axios.post(`${BASE}/rooms/join`, { code: roomA_code }, auth(pA2_token));
    if (r.data.data.room.status !== 'ACTIVE') throw new Error(`Room status: ${r.data.data.room.status}, expected ACTIVE`);
    ok(`Partner joined Room A → status: ACTIVE ✓`);
  } catch (e) { bug('Join room A', e); }

  // ────────────────────────────────────────────────────────────
  section('A-2: Socket.io — Both Users Connected');
  // ────────────────────────────────────────────────────────────
  await new Promise((resolve) => {
    let c1 = false, c2 = false;
    let timer = null;
    const check = () => {
      if (c1 && c2) {
        clearTimeout(timer);   // ← cancel the fallback timer immediately
        ok('Both users (A) connected via Socket.io ✓');
        resolve();
      }
    };
    const s1 = io(SOCKET, { auth: { token: pA_token },  transports: ['websocket'] });
    const s2 = io(SOCKET, { auth: { token: pA2_token }, transports: ['websocket'] });
    s1.on('connect', () => { c1 = true;  s1.disconnect(); check(); });
    s2.on('connect', () => { c2 = true;  s2.disconnect(); check(); });
    s1.on('connect_error', (e) => { clearTimeout(timer); bug('Socket Approach A — user 1', e); });
    s2.on('connect_error', (e) => { clearTimeout(timer); bug('Socket Approach A — user 2', e); });
    timer = setTimeout(() => bug('Socket timeout Approach A', new Error('5s timeout')), 5000);
  });

  // ────────────────────────────────────────────────────────────
  section('A-3: Fire RevenueCat Webhook (Simulated Real Purchase)');
  // ────────────────────────────────────────────────────────────
  const webhookPayload = {
    type: 'NON_RENEWING_PURCHASE',
    event: {
      app_user_id:    pA_id,
      product_id:     storeProductId,
      transaction_id: `TXN_A_${ts}`,
      store:          'PLAY_STORE',
      price:          10.00,
      currency:       'INR',
    }
  };
  let webhookCardsGranted = 0;
  try {
    const r = await axios.post(`${BASE}/store/purchase/verify`, webhookPayload,
      { headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` } });
    const d = r.data.data;
    if (d.skipped) throw new Error(`Skipped: ${d.reason}`);
    webhookCardsGranted = d.cards_received;
    ok(`Webhook processed → cards_received: ${webhookCardsGranted} | purchase_id: ${d.purchase_id}`);
  } catch (e) { bug('RevenueCat webhook (Approach A)', e); }

  // ────────────────────────────────────────────────────────────
  section('A-4: Verify Deck — Cards Exist and are Room-Locked');
  // ────────────────────────────────────────────────────────────
  let deckA_cardId = '';
  try {
    const r = await axios.get(`${BASE}/user/deck`, auth(pA_token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('Deck is empty after webhook purchase!');
    ok(`Deck A has ${total} card(s)`);
    r.data.data.cards.forEach((c, i) =>
      console.log(`     Card ${i+1}: "${c.card_name || c.name}" | room_id: ${c.room_id} | used: ${c.is_used}`));
  } catch (e) { bug('Get deck A (full)', e); }

  try {
    const r = await axios.get(`${BASE}/user/deck/available?room_id=${roomA_id}`, auth(pA_token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('No available cards found for Room A!');
    deckA_cardId = r.data.data.cards[0].deck_card_id;
    ok(`Deck A available cards for room: ${total} | first deck_card_id: ${deckA_cardId}`);
  } catch (e) { bug('Get deck A (available for room)', e); }

  // ────────────────────────────────────────────────────────────
  section('A-5: Play a Card in Room A');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.post(`${BASE}/user/deck/${deckA_cardId}/use`,
      { room_id: roomA_id }, auth(pA_token));
    const card = r.data.data.card;
    if (!card.is_used)           throw new Error('is_used is still FALSE after playing!');
    if (card.room_id !== roomA_id) throw new Error(`room_id mismatch! Got: ${card.room_id}`);
    ok(`Card played in Room A! is_used=TRUE | room_id matches ✓`);
  } catch (e) { bug('Play card in Room A', e); }

  // ────────────────────────────────────────────────────────────
  section('A-6: Verify Purchase History (User Side)');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.get(`${BASE}/store/purchase/history`, auth(pA_token));
    const purchases = r.data.data.purchases;
    if (!purchases || purchases.length === 0) throw new Error('Purchase history is empty!');
    ok(`Purchase history has ${purchases.length} record(s)`);
    purchases.slice(0, 2).forEach((p, i) =>
      console.log(`     #${i+1}: ${p.cards_received} cards | status: ${p.status} | ₹${p.amount_paid}`));
  } catch (e) { bug('Purchase history (Approach A)', e); }

  // ════════════════════════════════════════════════════════════
  section('APPROACH B — Admin Manual Grant');
  section('B-1: Create 2 Users → Room → Both Join');
  // ════════════════════════════════════════════════════════════
  pB1_email = `userB1_${ts}@test.com`;
  pB2_email = `userB2_${ts}@test.com`;
  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'User Beta 1', email: pB1_email, password: 'password123' });
    pB1_token = r.data.data.accessToken;
    pB1_id    = r.data.data.user.id;
    ok(`Approach B user 1 created → ${pB1_email}`);
  } catch (e) { bug('Create Approach B user 1', e); }

  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'User Beta 2', email: pB2_email, password: 'password123' });
    pB2_token = r.data.data.accessToken;
    ok(`Approach B user 2 created → ${pB2_email}`);
  } catch (e) { bug('Create Approach B user 2', e); }

  try {
    const r = await axios.post(`${BASE}/rooms/create`, { expiry_type: '7_DAYS' }, auth(pB1_token));
    roomB_id   = r.data.data.room.id;
    roomB_code = r.data.data.room.code;
    ok(`Room B created → ${roomB_code} | ID: ${roomB_id}`);
  } catch (e) { bug('Create room B', e); }

  try {
    const r = await axios.post(`${BASE}/rooms/join`, { code: roomB_code }, auth(pB2_token));
    if (r.data.data.room.status !== 'ACTIVE') throw new Error(`Room B status: ${r.data.data.room.status}`);
    ok(`User 2 joined Room B → status: ACTIVE ✓`);
  } catch (e) { bug('Join room B', e); }

  // ────────────────────────────────────────────────────────────
  section('B-2: Admin Grants Cards to User B1 (with room_id)');
  // ────────────────────────────────────────────────────────────
  let adminGrantCards = 0;
  try {
    const r = await axios.post(`${BASE}/admin/purchases/grant-cards`, {
      user_id:    pB1_id,
      plan_id:    plan1Id,
      room_id:    roomB_id,
      reason:     'Dual approach test — admin grant path'
    }, auth(adminToken));
    adminGrantCards = r.data.data.cards_granted;
    if (!adminGrantCards || adminGrantCards === 0) throw new Error('0 cards granted!');
    ok(`Admin granted ${adminGrantCards} cards to User B1 (room: ${roomB_code})`);
  } catch (e) { bug('Admin grant cards (Approach B)', e); }

  // ────────────────────────────────────────────────────────────
  section('B-3: Verify Admin Grant — Deck + Available Cards');
  // ────────────────────────────────────────────────────────────
  let deckB_cardId = '';
  try {
    const r = await axios.get(`${BASE}/user/deck`, auth(pB1_token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('Deck B is empty after admin grant!');
    ok(`Deck B has ${total} card(s)`);
    r.data.data.cards.forEach((c, i) =>
      console.log(`     Card ${i+1}: "${c.card_name || c.name}" | room_id: ${c.room_id} | used: ${c.is_used}`));
  } catch (e) { bug('Get deck B (full)', e); }

  try {
    const r = await axios.get(`${BASE}/user/deck/available?room_id=${roomB_id}`, auth(pB1_token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('No available cards for Room B!');
    deckB_cardId = r.data.data.cards[0].deck_card_id;
    ok(`Deck B available cards for room: ${total} | first deck_card_id: ${deckB_cardId}`);
  } catch (e) { bug('Get deck B (available for room)', e); }

  // ────────────────────────────────────────────────────────────
  section('B-4: Play a Card in Room B');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.post(`${BASE}/user/deck/${deckB_cardId}/use`,
      { room_id: roomB_id }, auth(pB1_token));
    const card = r.data.data.card;
    if (!card.is_used)             throw new Error('is_used is still FALSE after playing!');
    if (card.room_id !== roomB_id) throw new Error(`room_id mismatch! Got: ${card.room_id}`);
    ok(`Card played in Room B! is_used=TRUE | room_id matches ✓`);
  } catch (e) { bug('Play card in Room B', e); }

  // ────────────────────────────────────────────────────────────
  section('B-5: Admin Deck Audit for Both Users');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.get(`${BASE}/admin/users/${pA_id}/deck`, auth(adminToken));
    ok(`Admin audit User A: ${r.data.data.total} card(s) in deck`);
  } catch (e) { bug('Admin audit User A', e); }

  try {
    const r = await axios.get(`${BASE}/admin/users/${pB1_id}/deck`, auth(adminToken));
    ok(`Admin audit User B1: ${r.data.data.total} card(s) in deck`);
  } catch (e) { bug('Admin audit User B1', e); }

  // ────────────────────────────────────────────────────────────
  section('EDGE CASE: Admin Grant WITHOUT room_id (Must Fail)');
  // ────────────────────────────────────────────────────────────
  try {
    await axios.post(`${BASE}/admin/purchases/grant-cards`, {
      user_id:  pB1_id,
      plan_id:  plan1Id,
      reason:   'No room_id — should fail'
    }, auth(adminToken));
    bug('Grant without room_id SHOULD have returned 400 but it passed!',
      new Error('Option B enforcement BROKEN — grant succeeded without room_id'));
  } catch (e) {
    if (e?.response?.status === 400) {
      ok(`Option B enforced ✓ — grant without room_id correctly rejected (400)`);
    } else {
      bug('Grant without room_id unexpected error', e);
    }
  }

  // ────────────────────────────────────────────────────────────
  section('EDGE CASE: Admin Grant with INVALID/INACTIVE room_id (Must Fail)');
  // ────────────────────────────────────────────────────────────
  const fakeRoomId = '00000000-0000-0000-0000-000000000000';
  try {
    await axios.post(`${BASE}/admin/purchases/grant-cards`, {
      user_id:  pB1_id,
      plan_id:  plan1Id,
      room_id:  fakeRoomId,
      reason:   'Fake room — should fail'
    }, auth(adminToken));
    bug('Grant with fake room_id SHOULD have returned 400 but it passed!',
      new Error('Option B enforcement BROKEN — grant succeeded with fake room_id'));
  } catch (e) {
    if (e?.response?.status === 400) {
      ok(`Option B enforced ✓ — grant with invalid room_id correctly rejected (400)`);
    } else {
      bug('Grant with invalid room_id unexpected error', e);
    }
  }

  // ────────────────────────────────────────────────────────────
  section('EDGE CASE: Replay Same Transaction (Idempotency Check)');
  // ────────────────────────────────────────────────────────────
  try {
    const r = await axios.post(`${BASE}/store/purchase/verify`, webhookPayload,
      { headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` } });
    const d = r.data.data;
    if (d.skipped === true) {
      ok(`Duplicate transaction correctly SKIPPED ✓ — reason: "${d.reason}"`);
    } else {
      bug('Idempotency BROKEN — duplicate transaction was processed twice!',
        new Error('Same transaction_id was accepted twice'));
    }
  } catch (e) { bug('Idempotency check error', e); }

  // ────────────────────────────────────────────────────────────
  section('EDGE CASE: Webhook with Wrong Secret (Must Fail 401)');
  // ────────────────────────────────────────────────────────────
  try {
    await axios.post(`${BASE}/store/purchase/verify`, webhookPayload,
      { headers: { Authorization: 'Bearer wrong_secret_here' } });
    bug('Webhook with wrong secret SHOULD have returned 401 but passed!',
      new Error('Webhook security BROKEN'));
  } catch (e) {
    if (e?.response?.status === 401) {
      ok(`Webhook security enforced ✓ — wrong secret correctly rejected (401)`);
    } else {
      bug('Wrong webhook secret unexpected error', e);
    }
  }

  // ────────────────────────────────────────────────────────────
  printReport();
}

run().catch(e => {
  console.error('\n💥 Unhandled crash:', e.message);
  process.exit(1);
});
