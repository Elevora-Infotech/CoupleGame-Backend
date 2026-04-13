const axios = require('axios');
const chalk = require('chalk');
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000/api/v1';

async function testRooms() {
    console.log(chalk.bold.blue('\n🏠 STARTING ROOM API JOURNEY...\n'));

    try {
        console.log(chalk.yellow('Step 1: Creating Host & Partner users...'));
        const hostUser = { name: "Host", email: `host_${Date.now()}@test.com`, password: "password123" };
        const partnerUser = { name: "Partner", email: `partner_${Date.now()}@test.com`, password: "password123" };

        const hostRes = await axios.post(`${BASE_URL}/auth/signup`, hostUser);
        const hostToken = hostRes.data.data.accessToken;

        const partnerRes = await axios.post(`${BASE_URL}/auth/signup`, partnerUser);
        const partnerToken = partnerRes.data.data.accessToken;

        const hostAuth = { headers: { Authorization: `Bearer ${hostToken}` } };
        const partnerAuth = { headers: { Authorization: `Bearer ${partnerToken}` } };

        console.log(chalk.green('✔ SUCCESS: Users created.\n'));

        // CREATE ROOM
        console.log(chalk.yellow('Step 2: Host creating a room...'));
        const createRes = await axios.post(`${BASE_URL}/rooms/create`, { expiry_type: '7_DAYS' }, hostAuth);
        const roomCode = createRes.data.data.room.code;
        console.log(chalk.green(`✔ SUCCESS: Room created with code [${roomCode}].\n`));

        // GET ACTIVE ROOM (Host)
        console.log(chalk.yellow('Step 3: Host checking active room...'));
        const activeHostRes = await axios.get(`${BASE_URL}/rooms/active`, hostAuth);
        console.log(chalk.green(`✔ SUCCESS: Host active room is [${activeHostRes.data.data.room.code}].\n`));

        // JOIN ROOM
        console.log(chalk.yellow('Step 4: Partner joining room...'));
        const joinRes = await axios.post(`${BASE_URL}/rooms/join`, { code: roomCode }, partnerAuth);
        console.log(chalk.green(`✔ SUCCESS: Partner joined room successfully. Status: ${joinRes.data.data.room.status}\n`));

        // GET ACTIVE ROOM (Partner)
        console.log(chalk.yellow('Step 5: Partner checking active room...'));
        const activePartnerRes = await axios.get(`${BASE_URL}/rooms/active`, partnerAuth);
        console.log(chalk.green(`✔ SUCCESS: Partner active room is [${activePartnerRes.data.data.room.code}].\n`));

        // TEST SOCKET HANDSHAKE
        console.log(chalk.yellow('Step 6: Testing Socket Connection with JWT...'));

        await new Promise((resolve, reject) => {
            const socket = io('http://localhost:3000', {
                auth: { token: hostToken }
            });

            socket.on('connect', () => {
                console.log(chalk.green('✔ SUCCESS: Socket connected successfully via JWT.\n'));
                socket.disconnect();
                resolve();
            });

            socket.on('connect_error', (err) => {
                console.log(chalk.red('✘ FAIL: Socket connection error.'));
                reject(err);
            });

            setTimeout(() => reject(new Error('Socket timeout')), 5000);
        });

        console.log(chalk.bold.green('🏁 ROOM JOURNEY COMPLETE: ALL APIS WORKING!\n'));

    } catch (error) {
        if (error.response) {
            console.log(chalk.red(`✘ FAIL: status ${error.response.status}`));
            console.log(chalk.red(`Data: ${JSON.stringify(error.response.data)}`));
        } else {
            console.log(chalk.red(`✘ ERROR: ${error.message}`));
        }
    }
}

testRooms();
