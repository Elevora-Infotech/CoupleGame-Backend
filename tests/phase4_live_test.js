const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
const ADMIN_CREDS = { email: 'admin@elevora.com', password: 'admin123' };

let adminToken = '';
let hostToken = '';
let partnerToken = '';
let hostId = '';
let partnerId = '';
let roomId = '';
let testBundleId = '';
let testPlanId = '';
let deckCardId = '';

const ok = (msg) => console.log(`  ✔ PASS | ${msg}`);
const fail = (msg, err) => {
  console.log(`  ✘ FAIL | ${msg}`);
  if (err) console.error(err.response?.data || err.message);
  process.exit(1);
};
const section = (title) => console.log(`\n${'─'.repeat(50)}\n  ${title}\n${'─'.repeat(50)}`);

async function runTests() {
  console.log('\n🚀 ELEVORA PHASE 4 LIVE API TEST (PURCHASE & DECK) → ' + BASE_URL + '\n');

  // ── SETUP: Admin Login ─────────────────────────────────────
  section('1. Admin Authentication');
  try {
    const res = await axios.post(`${BASE_URL}/admin/auth/login`, ADMIN_CREDS);
    adminToken = res.data.data.token;
    ok('Admin login successful');
  } catch (e) { fail('Admin login', e); }
  const adminAuth = { headers: { Authorization: `Bearer ${adminToken}` } };

  // ── SETUP: Bundle & Plan (so we have something to grant) ────
  section('2. Setup Test Bundle & Cards');
  try {
    const bRes = await axios.post(`${BASE_URL}/admin/bundles`, {
      name: `TEST_BUNDLE_P4_${Date.now()}`,
      description: 'Phase 4 live test bundle',
      cover_image_url: 'https://example.com/img.jpg'
    }, adminAuth);
    testBundleId = bRes.data.data.bundle.id;
    ok('Created test bundle');

    const pRes = await axios.post(`${BASE_URL}/admin/bundles/${testBundleId}/plans`, {
      name: 'Starter', price: 10.00, card_count: 5
    }, adminAuth);
    testPlanId = pRes.data.data.plan.id;
    ok('Created test bundle plan (auto-generated store_product_id)');
    
    // add cards to bundle so algo can give them
    const cardsRes = await axios.get(`${BASE_URL}/admin/dashboard/cards`, adminAuth);
    const activeCards = cardsRes.data.data.cards.filter(c => c.is_active).slice(0, 10).map(c => c.id);
    if(activeCards.length > 0) {
      await axios.post(`${BASE_URL}/admin/bundles/${testBundleId}/cards`, { card_ids: activeCards }, adminAuth);
      ok(`Added ${activeCards.length} cards to bundle`);
    } else {
      console.log('  ⚠️ WARNING: No active cards found in DB to add to bundle');
    }

  } catch (e) { fail('Setup test bundle & plan', e); }

  // ── SETUP: Users & Room ─────────────────────────────────────
  section('3. User Flow & Room Creation');
  try {
    const hostRes = await axios.post(`${BASE_URL}/auth/signup`, { name: 'HostP4', email: `host_p4_${Date.now()}@test.com`, password: 'password123' });
    hostToken = hostRes.data.data.accessToken;
    hostId = hostRes.data.data.user.id;
    ok('Host user created');

    const partnerRes = await axios.post(`${BASE_URL}/auth/signup`, { name: 'PartnerP4', email: `partner_p4_${Date.now()}@test.com`, password: 'password123' });
    partnerToken = partnerRes.data.data.accessToken;
    partnerId = partnerRes.data.data.user.id;
    ok('Partner user created');
  } catch (e) { fail('User creation', e); }
  const hostAuth = { headers: { Authorization: `Bearer ${hostToken}` } };
  const partnerAuth = { headers: { Authorization: `Bearer ${partnerToken}` } };

  try {
    const rRes = await axios.post(`${BASE_URL}/rooms/create`, { expiry_type: '7_DAYS' }, hostAuth);
    roomId = rRes.data.data.room.id;
    const roomCode = rRes.data.data.room.code;
    ok(`Host created room (Code: ${roomCode})`);

    await axios.post(`${BASE_URL}/rooms/join`, { code: roomCode }, partnerAuth);
    ok('Partner joined room');
  } catch (e) { fail('Room creation/join', e); }

  // ── PURCHASE FLOW ───────────────────────────────────────────
  section('4. Manual Card Grant (Simulating Purchase)');
  try {
    const grantRes = await axios.post(`${BASE_URL}/admin/purchases/grant-cards`, {
      user_id: hostId,
      plan_id: testPlanId,
      reason: 'Phase 4 Live Test Grant'
    }, adminAuth);
    ok(`Admin manually granted ${grantRes.data.data.cards_granted} cards to Host`);
  } catch (e) { fail('Manual card grant', e); }

  // ── DECK FLOW ───────────────────────────────────────────────
  section('5. User Card Deck Verification');
  try {
    const dRes = await axios.get(`${BASE_URL}/user/deck`, hostAuth);
    const totalCards = dRes.data.data.total;
    if (totalCards === 0) throw new Error('Host deck is empty after grant!');
    ok(`Host retrieved full deck (${totalCards} cards)`);
    deckCardId = dRes.data.data.cards[0].deck_card_id;

    const availRes = await axios.get(`${BASE_URL}/user/deck/available`, hostAuth);
    ok(`Host retrieved available cards (${availRes.data.data.total} unused/unexpired cards)`);
  } catch (e) { fail('Deck retrieval', e); }

  try {
    const playRes = await axios.post(`${BASE_URL}/user/deck/${deckCardId}/use`, { room_id: roomId }, hostAuth);
    if (!playRes.data.data.card.is_used) throw new Error('Card is_used flag did not update');
    ok(`Host played a card in room successfully (is_used set to TRUE)`);
  } catch (e) { fail('Playing card', e); }

  // ── ADMIN AUDIT FLOW ─────────────────────────────────────────
  section('6. Admin Deck Audit');
  try {
    const aRes = await axios.get(`${BASE_URL}/admin/users/${hostId}/deck`, adminAuth);
    ok(`Admin audited Host's deck (${aRes.data.data.total} cards)`);
  } catch (e) { fail('Admin deck audit', e); }

  console.log(`\n🎉 ALL PHASE 4 LIVE TESTS PASSED SUCCESFULLY!\n`);
}

runTests().catch(e => fail('Unhandled error', e));
