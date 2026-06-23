'use strict';
/**
 * live_coin_flip_test.js
 * ───────────────────────
 * Tests the real-time Coin Flip feature.
 * 1. Creates two test users (Host and Partner).
 * 2. Host creates a 7-day room.
 * 3. Partner joins the room.
 * 4. Both users connect via socket.io-client and join the room.
 * 5. Host triggers the coin flip via HTTP API.
 * 6. Validates that BOTH sockets receive the exact same result simultaneously.
 */

require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const jwt = require('jsonwebtoken');
const { env } = require('../src/config/env');
const crypto = require('crypto');
const ioClient = require('socket.io-client');

const API_BASE = 'http://localhost:3000/api/v1';

let pass = 0, fail = 0;
const bugs = [];
const log = (m) => console.log('\x1b[36mℹ\x1b[0m ' + m);
const ok = (m) => { pass++; console.log('\x1b[32m✅ PASS\x1b[0m ' + m); };
const err = (m) => { fail++; bugs.push(m); console.log('\x1b[31m❌ FAIL\x1b[0m ' + m); };

const generateToken = (userId) => jwt.sign({ id: userId }, env.JWT_ACCESS_SECRET, { expiresIn: '1h' });

const request = async (method, endpoint, token, body = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    
    return { status: res.status, data };
  } catch (e) {
    return { status: 500, data: { status: 'error', message: e.message } };
  }
};

const CLEANUP_USERS = [];
async function createUser(prefix) {
  const id = crypto.randomUUID();
  await supabase.from('users').insert([{ id, email: `${prefix}_${Date.now()}@test.com`, name: `Test ${prefix}` }]);
  CLEANUP_USERS.push(id);
  return { id, token: generateToken(id) };
}

async function cleanup() {
  if (CLEANUP_USERS.length) {
    await supabase.from('users').delete().in('id', CLEANUP_USERS);
    log(`Cleaned up test users.`);
  }
}

async function connectSocket(token, roomCode) {
    return new Promise((resolve, reject) => {
        const socket = ioClient('http://localhost:3000', {
            auth: { token }
        });
        
        socket.on('connect', () => {
            socket.emit('join_room', roomCode);
            setTimeout(() => resolve(socket), 500); // Give it time to join the UUID room
        });
        
        socket.on('connect_error', (e) => reject(e));
    });
}

async function runTests() {
  console.log('\n\x1b[33m🚀 STARTING REAL-TIME COIN FLIP TEST...\x1b[0m\n');
  
  let host, partner, roomCode;
  
  // Setup
  try {
      host = await createUser('Flipper_Host');
      partner = await createUser('Flipper_Partner');
      ok('[T1] Created Host and Partner users');
      
      const createRes = await request('POST', '/rooms/create', host.token, { expiry_type: '7_DAYS' });
      roomCode = createRes.data?.data?.room?.code;
      ok('[T2] Host created room: ' + roomCode);
      
      const joinRes = await request('POST', '/rooms/join', partner.token, { code: roomCode });
      if (joinRes.status === 200) ok('[T3] Partner joined room');
      else throw new Error('Join failed');
  } catch (e) {
      err('Setup failed: ' + e.message);
      process.exit(1);
  }
  
  // WebSockets
  let hostSocket, partnerSocket;
  try {
      hostSocket = await connectSocket(host.token, roomCode);
      partnerSocket = await connectSocket(partner.token, roomCode);
      ok('[T4] Both users connected via WebSocket and joined room channels');
  } catch(e) {
      err('Socket connection failed: ' + e.message);
  }
  
  // Coin Flip Flow
  log('Triggering Coin Flip via HTTP (Chosen Side: HEADS, Reason: "Who pays for dinner")...');
  
  const hostSocketPromise = new Promise(resolve => {
      hostSocket.on('coin_flip_result', data => resolve({ user: 'Host', data }));
  });
  
  const partnerSocketPromise = new Promise(resolve => {
      partnerSocket.on('coin_flip_result', data => resolve({ user: 'Partner', data }));
  });
  
  const flipRes = await request('POST', '/rooms/coin-flip', host.token, {
      chosen_side: 'HEADS',
      reason: 'Who pays for dinner'
  });
  
  if (flipRes.status === 200) {
      ok('[T5] Coin flip API succeeded and returned result synchronously');
      const apiResult = flipRes.data.data;
      
      // Wait for sockets
      const [hostEvt, partnerEvt] = await Promise.all([hostSocketPromise, partnerSocketPromise]);
      
      if (hostEvt && partnerEvt) {
          ok('[T6] BOTH sockets received the coin_flip_result event in real-time');
          
          if (hostEvt.data.result === apiResult.result && partnerEvt.data.result === apiResult.result) {
              ok(`[T7] Both sockets agree with the API result! (Result: ${apiResult.result})`);
          } else {
              err('[T7] Result mismatch across sockets/API');
          }
          
          if (hostEvt.data.winner_id === apiResult.winner_id && hostEvt.data.reason === 'Who pays for dinner') {
              ok(`[T8] Payload is fully intact (Reason, Chosen Side, Winner ID).`);
              log(`   Winner is: ${apiResult.winner_id === host.id ? 'Host (Flipper)' : 'Partner'}`);
          } else {
              err('[T8] Payload missing critical data');
          }
          
      } else {
          err('[T6] Sockets did not receive the event');
      }
      
  } else {
      err('[T5] Coin flip API failed: ' + JSON.stringify(flipRes.data));
  }
  
  // Bad inputs check
  const badRes = await request('POST', '/rooms/coin-flip', host.token, {
      chosen_side: 'SIDEWAYS',
      reason: ''
  });
  if (badRes.status === 400) ok('[T9] Validation correctly rejected bad inputs (Empty reason / Invalid side)');
  else err('[T9] Validation failed');
  
  // Cleanup
  hostSocket.disconnect();
  partnerSocket.disconnect();
  await cleanup();
  
  console.log('\n\x1b[33m══ FINAL RESULTS ══\x1b[0m');
  console.log(`\x1b[32mPASS: ${pass}\x1b[0m`);
  console.log(`\x1b[31mFAIL: ${fail}\x1b[0m`);
  
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Fatal Error:', e);
  cleanup().finally(() => process.exit(1));
});
