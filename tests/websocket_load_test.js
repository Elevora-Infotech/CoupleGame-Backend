'use strict';

/**
 * @file   websocket_load_test.js
 * @desc   WebSocket concurrency & stress test for EleVora server.
 *         Connects N concurrent socket connections using direct WS transport,
 *         bypassing the Express rate limiter, using a programmatically signed token.
 * @usage  node tests/websocket_load_test.js [concurrency] [target_url]
 */

require('dotenv').config();
const { io } = require('socket.io-client');
const { generateAccessToken } = require('../src/utils/jwt');

// Arguments
const CONCURRENCY = parseInt(process.argv[2], 10) || 500;
const TARGET      = process.argv[3] || 'http://54.91.119.137';
const RAMP_UP_MS  = parseInt(process.argv[4], 10) || 10; 

console.log(`\n🔥 ELEVORA WEBSOCKET CONCURRENCY LOAD TEST`);
console.log(`=========================================`);
console.log(`Target URL  : ${TARGET}`);
console.log(`Sockets     : ${CONCURRENCY}`);
console.log(`Ramp-up     : 1 connection every ${RAMP_UP_MS}ms`);

// Programmatically generate a JWT to bypass Auth HTTP endpoints
const token = generateAccessToken('load-test-user-uuid');
console.log(`JWT Token   : Programmatically signed (length: ${token.length})`);

const sockets = [];
let connectedCount = 0;
let failedCount = 0;
let messageSent = 0;
let messageRecv = 0;
let latencies = [];

// Print status interval
const statusInterval = setInterval(() => {
  const avgLatency = latencies.length 
    ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) + 'ms'
    : 'N/A';

  process.stdout.write(
    `\r[Status] Attempted: ${sockets.length}/${CONCURRENCY} | Connected: ${connectedCount} | Failed: ${failedCount} | Sent: ${messageSent} | Recv: ${messageRecv} | Avg Latency: ${avgLatency}   `
  );
}, 200);

async function start() {
  for (let i = 0; i < CONCURRENCY; i++) {
    await new Promise(r => setTimeout(r, RAMP_UP_MS));

    const socket = io(TARGET, {
      auth: { token },
      transports: ['websocket'], // FORCE websocket to bypass express-rate-limit
      forceNew: true,
      reconnection: false
    });

    sockets.push(socket);

    const connectStart = Date.now();

    socket.on('connect', () => {
      connectedCount++;
      const latency = Date.now() - connectStart;
      latencies.push(latency);

      // Join a mock load test room
      socket.emit('join_room', 'LOAD_TEST_ROOM');

      // Schedule periodic game event emits to simulate activity
      const activityInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('game_event', {
            roomCode: 'LOAD_TEST_ROOM',
            eventType: 'PING_STRESS',
            data: { timestamp: Date.now() }
          });
          messageSent++;
        } else {
          clearInterval(activityInterval);
        }
      }, 5000);
    });

    socket.on('game_event', (payload) => {
      if (payload && payload.eventType === 'PING_STRESS') {
        messageRecv++;
      }
    });

    socket.on('connect_error', (err) => {
      failedCount++;
      if (failedCount <= 3) {
        console.error(`\n[Connection Error Detail] ${err.message}`);
      }
    });

    socket.on('disconnect', () => {
      connectedCount = Math.max(0, connectedCount - 1);
    });
  }

  // Run the test for 20 seconds after all connections are established
  setTimeout(() => {
    console.log(`\n\nStopping test... Disconnecting all sockets...`);
    clearInterval(statusInterval);
    sockets.forEach(s => s.disconnect());
    console.log(`Done! All sockets disconnected cleanly.`);
    process.exit(0);
  }, 20000);
}

start().catch(err => {
  console.error('\nTest crashed:', err);
  process.exit(1);
});
