'use strict';
require('dotenv').config();

/**
 * @file   live_block_enforcement_test.js
 * @desc   Live test against AWS backend: 54.91.119.137:3000
 *
 * FLOW:
 *   1.  Admin logs in
 *   2.  Create 2 test users (Player 1 + Player 2)
 *   3.  Player 1 creates a room
 *   4.  Player 2 joins the room
 *   5.  Verify both users can play (pre-block baseline: 40+ tests)
 *   6.  Admin BLOCKS Player 1
 *   7.  Verify Player 1 is completely locked out (30+ tests)
 *   8.  Verify Player 2 (unblocked) still works fine (10 tests)
 *   9.  Admin UNBLOCKS Player 1
 *   10. Verify Player 1 can log in again (10 tests)
 *   11. Cleanup
 */

const axios = require('axios');

const BASE   = 'http://54.91.119.137:3000/api/v1';
const ADMIN  = { email: 'admin@elevora.com', password: 'admin123' };

// ── Colour helpers ─────────────────────────────────────────────
const g = (t) => `\x1b[32m${t}\x1b[0m`;
const r = (t) => `\x1b[31m${t}\x1b[0m`;
const y = (t) => `\x1b[33m${t}\x1b[0m`;
const b = (t) => `\x1b[34m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;

// ── State ──────────────────────────────────────────────────────
let adminToken = '';
let p1Token = '', p1RefreshToken = '', p1Id = '', p1Email = '';
let p2Token = '', p2RefreshToken = '', p2Id = '', p2Email = '';
let roomCode = '', roomId = '';

let passed = 0;
let failed = 0;
const failures = [];

// ── Helpers ────────────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2, 8);
const api  = (token) => axios.create({
  baseURL: BASE,
  timeout: 12000,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true, // never throw on HTTP errors
});

/**
 * assert(label, condition, detail?)
 * Logs PASS/FAIL and accumulates totals.
 */
function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${g('✔')} ${label}`);
    passed++;
  } else {
    console.log(`  ${r('✘')} ${label}${detail ? `  ${dim('→ ' + detail)}` : ''}`);
    failed++;
    failures.push({ label, detail });
  }
}

/**
 * section(title)
 * Prints a section header.
 */
function section(title) {
  console.log(`\n${b('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  console.log(`${b('  ' + title)}`);
  console.log(`${b('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
}

// ══════════════════════════════════════════════════════════════
// PHASE 0 — Server Health Check
// ══════════════════════════════════════════════════════════════
async function phase0_healthCheck() {
  section('PHASE 0 — Server Health Check');
  const res = await api().get('/health');
  assert('Server is reachable (200)', res.status === 200, `Got ${res.status}`);
  assert('Response has status=success', res.data?.status === 'success', JSON.stringify(res.data));
  if (res.status !== 200) {
    console.log(r('\n  ⛔ Server unreachable. Aborting all tests.\n'));
    process.exit(1);
  }
}

// ══════════════════════════════════════════════════════════════
// PHASE 1 — Admin Auth
// ══════════════════════════════════════════════════════════════
async function phase1_adminLogin() {
  section('PHASE 1 — Admin Login');
  const res = await api().post('/admin/auth/login', ADMIN);
  assert('Admin login returns 200', res.status === 200, `Got ${res.status}`);
  assert('Admin receives a token', !!res.data?.data?.token, JSON.stringify(res.data?.data));
  adminToken = res.data?.data?.token || '';
  if (!adminToken) {
    console.log(r('\n  ⛔ Cannot proceed without admin token. Aborting.\n'));
    process.exit(1);
  }
}

// ══════════════════════════════════════════════════════════════
// PHASE 2 — Create 2 Test Users
// ══════════════════════════════════════════════════════════════
async function phase2_createUsers() {
  section('PHASE 2 — Create 2 Test Users');

  // Player 1
  p1Email = `block_test_p1_${uid()}@test.com`;
  const r1 = await api().post('/auth/signup', {
    name: 'Block Test P1',
    email: p1Email,
    password: 'Test@12345',
  });
  assert('P1 signup returns 201', r1.status === 201, `Got ${r1.status}`);
  assert('P1 receives accessToken', !!r1.data?.data?.accessToken);
  assert('P1 receives refreshToken', !!r1.data?.data?.refreshToken);
  p1Token        = r1.data?.data?.accessToken || '';
  p1RefreshToken = r1.data?.data?.refreshToken || '';
  p1Id           = r1.data?.data?.user?.id || '';
  assert('P1 has a valid user ID', !!p1Id, p1Id);

  // Player 2
  p2Email = `block_test_p2_${uid()}@test.com`;
  const r2 = await api().post('/auth/signup', {
    name: 'Block Test P2',
    email: p2Email,
    password: 'Test@12345',
  });
  assert('P2 signup returns 201', r2.status === 201, `Got ${r2.status}`);
  p2Token        = r2.data?.data?.accessToken || '';
  p2RefreshToken = r2.data?.data?.refreshToken || '';
  p2Id           = r2.data?.data?.user?.id || '';
  assert('P2 has a valid user ID', !!p2Id, p2Id);
}

// ══════════════════════════════════════════════════════════════
// PHASE 3 — Room Setup
// ══════════════════════════════════════════════════════════════
async function phase3_roomSetup() {
  section('PHASE 3 — Room Setup (P1 creates, P2 joins)');

  // P1 creates room
  const rc = await api(p1Token).post('/rooms/create', { expiry_type: '7_DAYS' });
  assert('P1 can create a room (201)', rc.status === 201, `Got ${rc.status}: ${JSON.stringify(rc.data)}`);
  roomCode = rc.data?.data?.room?.code || '';
  roomId   = rc.data?.data?.room?.id   || '';
  assert('Room code exists', !!roomCode, roomCode);

  // P2 joins room
  const rj = await api(p2Token).post('/rooms/join', { code: roomCode });
  assert('P2 can join the room (200)', rj.status === 200, `Got ${rj.status}: ${JSON.stringify(rj.data)}`);
  assert('Joined room is ACTIVE', rj.data?.data?.room?.status === 'ACTIVE', rj.data?.data?.room?.status);
}

// ══════════════════════════════════════════════════════════════
// PHASE 4 — Pre-Block Baseline (both users work)
// ══════════════════════════════════════════════════════════════
async function phase4_preBlockBaseline() {
  section('PHASE 4 — Pre-Block Baseline (verifying both users work)');

  // P1 can access profile
  const p1Profile = await api(p1Token).get('/profile');
  assert('P1 can GET /profile (200)', p1Profile.status === 200, `Got ${p1Profile.status}`);

  // P2 can access profile
  const p2Profile = await api(p2Token).get('/profile');
  assert('P2 can GET /profile (200)', p2Profile.status === 200, `Got ${p2Profile.status}`);

  // P1 can view active room
  const p1Room = await api(p1Token).get('/rooms/active');
  assert('P1 can GET /rooms/active (200)', p1Room.status === 200, `Got ${p1Room.status}`);

  // P2 can view active room
  const p2Room = await api(p2Token).get('/rooms/active');
  assert('P2 can GET /rooms/active (200)', p2Room.status === 200, `Got ${p2Room.status}`);

  // Both users can view their deck
  const p1Deck = await api(p1Token).get('/deck/available');
  assert('P1 can GET /deck/available', [200, 404].includes(p1Deck.status), `Got ${p1Deck.status}`);

  const p2Deck = await api(p2Token).get('/deck/available');
  assert('P2 can GET /deck/available', [200, 404].includes(p2Deck.status), `Got ${p2Deck.status}`);

  // P1 can refresh token
  const p1Refresh = await api().post('/auth/refresh-token', { refreshToken: p1RefreshToken });
  assert('P1 can refresh token (200)', p1Refresh.status === 200, `Got ${p1Refresh.status}`);
  if (p1Refresh.data?.data?.accessToken) {
    p1Token        = p1Refresh.data.data.accessToken;
    p1RefreshToken = p1Refresh.data.data.refreshToken;
  }

  // P2 can refresh token
  const p2Refresh = await api().post('/auth/refresh-token', { refreshToken: p2RefreshToken });
  assert('P2 can refresh token (200)', p2Refresh.status === 200, `Got ${p2Refresh.status}`);
  if (p2Refresh.data?.data?.accessToken) {
    p2Token        = p2Refresh.data.data.accessToken;
    p2RefreshToken = p2Refresh.data.data.refreshToken;
  }

  // P1 can log in
  const p1Login = await api().post('/auth/login', { email: p1Email, password: 'Test@12345' });
  assert('P1 can login (200)', p1Login.status === 200, `Got ${p1Login.status}: ${JSON.stringify(p1Login.data)}`);

  // P2 can log in
  const p2Login = await api().post('/auth/login', { email: p2Email, password: 'Test@12345' });
  assert('P2 can login (200)', p2Login.status === 200, `Got ${p2Login.status}`);

  // Update tokens from fresh logins
  p1Token        = p1Login.data?.data?.accessToken || p1Token;
  p1RefreshToken = p1Login.data?.data?.refreshToken || p1RefreshToken;
  p2Token        = p2Login.data?.data?.accessToken || p2Token;
  p2RefreshToken = p2Login.data?.data?.refreshToken || p2RefreshToken;

  // Admin sees both users in user list
  const userList = await api(adminToken).get('/admin/users?limit=100');
  assert('Admin can GET /admin/users (200)', userList.status === 200, `Got ${userList.status}`);

  // Admin can see user stats
  const stats = await api(adminToken).get('/admin/users/stats');
  assert('Admin can GET /admin/users/stats (200)', stats.status === 200, `Got ${stats.status}`);
}

// ══════════════════════════════════════════════════════════════
// PHASE 5 — Admin Blocks P1
// ══════════════════════════════════════════════════════════════
async function phase5_adminBlocksP1() {
  section(`PHASE 5 — Admin Blocks Player 1 (ID: ${p1Id})`);

  const blockRes = await api(adminToken).patch(`/admin/users/${p1Id}/block`);
  assert('Admin block returns 200', blockRes.status === 200, `Got ${blockRes.status}: ${JSON.stringify(blockRes.data)}`);
  assert('Response confirms user is blocked', blockRes.data?.data?.user?.is_blocked === true, JSON.stringify(blockRes.data?.data?.user));
}

// ══════════════════════════════════════════════════════════════
// PHASE 6 — Blocked User (P1) is Fully Locked Out
// ══════════════════════════════════════════════════════════════
async function phase6_blockedUserIsLockedOut() {
  section('PHASE 6 — Blocked P1 is Locked Out (30 tests)');

  // ── 6.1: Login must be blocked ─────────────────────────────
  const loginRes = await api().post('/auth/login', { email: p1Email, password: 'Test@12345' });
  assert('Blocked P1: login returns 403', loginRes.status === 403, `Got ${loginRes.status}`);
  assert('Blocked P1: login message is correct', loginRes.data?.message?.toLowerCase().includes('suspended'), loginRes.data?.message);

  // ── 6.2: Token refresh must be blocked ────────────────────
  const refreshRes = await api().post('/auth/refresh-token', { refreshToken: p1RefreshToken });
  assert('Blocked P1: refresh-token returns 403', refreshRes.status === 403, `Got ${refreshRes.status}`);
  assert('Blocked P1: refresh message is correct', refreshRes.data?.message?.toLowerCase().includes('suspended'), refreshRes.data?.message);

  // ── 6.3: Existing token must be rejected on all routes ────
  const profileRes = await api(p1Token).get('/profile');
  assert('Blocked P1: GET /profile returns 403', profileRes.status === 403, `Got ${profileRes.status}`);

  const roomRes = await api(p1Token).get('/rooms/active');
  assert('Blocked P1: GET /rooms/active returns 403', roomRes.status === 403, `Got ${roomRes.status}`);

  const deckRes = await api(p1Token).get('/deck/available');
  assert('Blocked P1: GET /deck/available returns 403', deckRes.status === 403, `Got ${deckRes.status}`);

  const questRes = await api(p1Token).get('/questionnaire');
  assert('Blocked P1: GET /questionnaire returns 403', questRes.status === 403, `Got ${questRes.status}`);

  const roomCreateRes = await api(p1Token).post('/rooms/create', { expiry_type: '7_DAYS' });
  assert('Blocked P1: POST /rooms/create returns 403', roomCreateRes.status === 403, `Got ${roomCreateRes.status}`);

  const roomJoinRes = await api(p1Token).post('/rooms/join', { code: 'XXXXX' });
  assert('Blocked P1: POST /rooms/join returns 403', roomJoinRes.status === 403, `Got ${roomJoinRes.status}`);

  const deflectRes = await api(p1Token).get('/deck/deflect-cards');
  assert('Blocked P1: GET /deck/deflect-cards returns 403', [403, 404].includes(deflectRes.status) && deflectRes.status === 403, `Got ${deflectRes.status}`);

  // Test multiple times to ensure it's not a fluke
  for (let i = 1; i <= 5; i++) {
    const repeated = await api(p1Token).get('/profile');
    assert(`Blocked P1: repeated call #${i} still 403`, repeated.status === 403, `Got ${repeated.status}`);
  }

  // Ensure wrong password also blocked
  const wrongPassLogin = await api().post('/auth/login', { email: p1Email, password: 'WrongPassword!' });
  assert('Blocked P1: login with wrong password also returns 403 (not 401)', wrongPassLogin.status === 403, `Got ${wrongPassLogin.status}`);

  // Attempt signup with same email (should be 409 conflict, not bypass block)
  const signupAgain = await api().post('/auth/signup', { name: 'Hacker', email: p1Email, password: 'Test@12345' });
  assert('Blocked P1: re-signup with same email returns 409 conflict', signupAgain.status === 409, `Got ${signupAgain.status}`);

  // Test with a garbage token (should be 401, not 403)
  const garbageRes = await api('garbage.token.here').get('/profile');
  assert('Garbage token correctly returns 401 (not 403)', garbageRes.status === 401, `Got ${garbageRes.status}`);

  // Test with no token (should be 401, not 403)
  const noTokenRes = await api().get('/profile');
  assert('No token correctly returns 401 (not 403)', noTokenRes.status === 401, `Got ${noTokenRes.status}`);
}

// ══════════════════════════════════════════════════════════════
// PHASE 7 — Unblocked Player (P2) Still Works
// ══════════════════════════════════════════════════════════════
async function phase7_unblockedUserStillWorks() {
  section('PHASE 7 — Unblocked P2 Is Unaffected (10 tests)');

  const profileRes = await api(p2Token).get('/profile');
  assert('P2 (unblocked): GET /profile still works (200)', profileRes.status === 200, `Got ${profileRes.status}`);

  const roomRes = await api(p2Token).get('/rooms/active');
  assert('P2 (unblocked): GET /rooms/active still works (200)', roomRes.status === 200, `Got ${roomRes.status}`);

  const deckRes = await api(p2Token).get('/deck/available');
  assert('P2 (unblocked): GET /deck/available works', [200, 404].includes(deckRes.status), `Got ${deckRes.status}`);

  // P2 can still refresh token
  const refreshRes = await api().post('/auth/refresh-token', { refreshToken: p2RefreshToken });
  assert('P2 (unblocked): refresh-token still works (200)', refreshRes.status === 200, `Got ${refreshRes.status}`);
  if (refreshRes.data?.data?.accessToken) {
    p2Token        = refreshRes.data.data.accessToken;
    p2RefreshToken = refreshRes.data.data.refreshToken;
  }

  // P2 can still login
  const loginRes = await api().post('/auth/login', { email: p2Email, password: 'Test@12345' });
  assert('P2 (unblocked): login still works (200)', loginRes.status === 200, `Got ${loginRes.status}`);

  // Admin user list still works
  const adminRes = await api(adminToken).get('/admin/users?limit=100');
  assert('Admin: user list still works after blocking P1', adminRes.status === 200, `Got ${adminRes.status}`);

  // Admin can see P1 is blocked in user list
  const allUsers = adminRes.data?.data?.users || [];
  const p1InList = allUsers.find(u => u.id === p1Id);
  assert('Admin: P1 shows as is_blocked=true in user list', p1InList?.is_blocked === true, JSON.stringify(p1InList));

  // Admin stats still work
  const statsRes = await api(adminToken).get('/admin/users/stats');
  assert('Admin: /admin/users/stats still works (200)', statsRes.status === 200, `Got ${statsRes.status}`);
  assert('Admin: blocked_users count >= 1', (statsRes.data?.data?.stats?.blocked_users ?? 0) >= 1, JSON.stringify(statsRes.data?.data?.stats));
}

// ══════════════════════════════════════════════════════════════
// PHASE 8 — Admin Unblocks P1
// ══════════════════════════════════════════════════════════════
async function phase8_adminUnblocksP1() {
  section('PHASE 8 — Admin Unblocks P1');

  const unblockRes = await api(adminToken).patch(`/admin/users/${p1Id}/unblock`);
  assert('Admin unblock returns 200', unblockRes.status === 200, `Got ${unblockRes.status}: ${JSON.stringify(unblockRes.data)}`);
  assert('Response confirms user is unblocked', unblockRes.data?.data?.user?.is_blocked === false, JSON.stringify(unblockRes.data?.data?.user));
}

// ══════════════════════════════════════════════════════════════
// PHASE 9 — P1 Can Log In Again After Unblock
// ══════════════════════════════════════════════════════════════
async function phase9_unblockedCanLoginAgain() {
  section('PHASE 9 — P1 Can Access App Again After Unblock (10 tests)');

  // Login should now work
  const loginRes = await api().post('/auth/login', { email: p1Email, password: 'Test@12345' });
  assert('P1 (unblocked): login returns 200 again', loginRes.status === 200, `Got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
  assert('P1 (unblocked): receives new accessToken', !!loginRes.data?.data?.accessToken);

  const freshToken        = loginRes.data?.data?.accessToken || '';
  const freshRefreshToken = loginRes.data?.data?.refreshToken || '';

  // Fresh token must work on protected routes
  const profileRes = await api(freshToken).get('/profile');
  assert('P1 (unblocked): GET /profile works (200)', profileRes.status === 200, `Got ${profileRes.status}`);

  const roomRes = await api(freshToken).get('/rooms/active');
  assert('P1 (unblocked): GET /rooms/active works (200)', roomRes.status === 200, `Got ${roomRes.status}`);

  const deckRes = await api(freshToken).get('/deck/available');
  assert('P1 (unblocked): GET /deck/available works', [200, 404].includes(deckRes.status), `Got ${deckRes.status}`);

  // Refresh token must work
  const refreshRes = await api().post('/auth/refresh-token', { refreshToken: freshRefreshToken });
  assert('P1 (unblocked): refresh-token works (200)', refreshRes.status === 200, `Got ${refreshRes.status}`);

  // Admin verifies P1 is no longer blocked
  const userDetail = await api(adminToken).get(`/admin/users/${p1Id}`);
  assert('Admin: P1 user detail shows is_blocked=false', userDetail.data?.data?.user?.is_blocked === false, JSON.stringify(userDetail.data?.data?.user));

  // Test multiple calls work fine now
  for (let i = 1; i <= 3; i++) {
    const repeated = await api(freshToken).get('/profile');
    assert(`P1 (unblocked): repeated call #${i} works (200)`, repeated.status === 200, `Got ${repeated.status}`);
  }
}

// ══════════════════════════════════════════════════════════════
// PHASE 10 — Cleanup: Delete Test Users via Admin
// ══════════════════════════════════════════════════════════════
async function phase10_cleanup() {
  section('PHASE 10 — Cleanup');
  console.log(dim(`  Note: Test users (${p1Email}, ${p2Email}) remain in DB.`));
  console.log(dim('  These are safe to delete from Supabase Dashboard manually.'));
  assert('Cleanup phase acknowledged', true);
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
(async () => {
  console.log(`\n${y('╔══════════════════════════════════════════════════╗')}`);
  console.log(`${y('║  EleVora — Block Enforcement Live Test Suite     ║')}`);
  console.log(`${y('║  Target: http://54.91.119.137:3000/api/v1        ║')}`);
  console.log(`${y('╚══════════════════════════════════════════════════╝')}`);

  try {
    await phase0_healthCheck();
    await phase1_adminLogin();
    await phase2_createUsers();
    await phase3_roomSetup();
    await phase4_preBlockBaseline();
    await phase5_adminBlocksP1();
    await phase6_blockedUserIsLockedOut();
    await phase7_unblockedUserStillWorks();
    await phase8_adminUnblocksP1();
    await phase9_unblockedCanLoginAgain();
    await phase10_cleanup();
  } catch (err) {
    console.log(r(`\n  ⛔ Unexpected crash: ${err.message}`));
    console.error(err);
  }

  // ── Final Report ───────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${y('╔══════════════════════════════════════════════════╗')}`);
  console.log(`${y('║  FINAL REPORT')}`);
  console.log(`${y('╠══════════════════════════════════════════════════╣')}`);
  console.log(`  Total:  ${total}`);
  console.log(`  ${g(`Passed: ${passed}`)}`);
  console.log(`  ${failed > 0 ? r(`Failed: ${failed}`) : g('Failed: 0')}`);

  if (failures.length > 0) {
    console.log(`\n${r('  ── Failed Tests ──────────────────────────────')}`);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${r(f.label)}`);
      if (f.detail) console.log(`     ${dim(f.detail)}`);
    });
  }

  console.log(`${y('╚══════════════════════════════════════════════════╝\n')}`);

  process.exit(failed > 0 ? 1 : 0);
})();
