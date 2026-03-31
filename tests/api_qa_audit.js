const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = 'http://localhost:3000/api/v1';

// Test Data
const USER_CREDENTIALS = {
  email: 'nikhilbhor201@gmail.com',
  password: 'securepassword123'
};

const ADMIN_CREDENTIALS = {
  email: 'admin@elevora.com',
  password: 'admin123'
};

let userToken = '';
let adminToken = '';

/**
 * Helper: Run a test case and log result
 */
async function runTest(name, fn) {
  try {
    await fn();
    console.log(`${chalk.green('✔ PASS')}: ${name}`);
  } catch (error) {
    const status = error.response ? error.response.status : 'NO_RESPONSE';
    const message = error.response ? JSON.stringify(error.response.data) : error.message;
    console.log(`${chalk.red('✘ FAIL')}: ${name} (Status: ${status}, Error: ${message})`);
  }
}

async function startAudit() {
  console.log(chalk.bold.blue('\n🚀 STARTING ELEVORA API QA AUDIT...\n'));

  // --- SETUP: AUTHENTICATION ---
  try {
    const userRes = await axios.post(`${BASE_URL}/auth/login`, USER_CREDENTIALS);
    userToken = userRes.data.data.accessToken;
    console.log(chalk.gray('Info: User token obtained.'));

    const adminRes = await axios.post(`${BASE_URL}/admin/auth/login`, ADMIN_CREDENTIALS);
    adminToken = adminRes.data.data.token;
    console.log(chalk.gray('Info: Admin token obtained.\n'));
  } catch (err) {
    console.log(chalk.red('⚠ FATAL: Could not obtain tokens for testing.'));
    if (err.response) {
      console.log(chalk.yellow(`Status: ${err.response.status}`));
      console.log(chalk.yellow(`Data: ${JSON.stringify(err.response.data)}`));
    } else {
      console.log(chalk.yellow(`Error: ${err.message}`));
    }
    process.exit(1);
  }

  // --- PHASE 1: HAPPY PATH (200 OK) ---
  console.log(chalk.cyan('--- Phase 1: Happy Path ---'));
  
  await runTest('GET /profile/me (Valid Token)', async () => {
    const res = await axios.get(`${BASE_URL}/profile/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (res.status !== 200 || !res.data.data.profile) throw new Error('Invalid structure');
  });

  await runTest('GET /admin/dashboard/stats (Admin Only)', async () => {
    await axios.get(`${BASE_URL}/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  // --- PHASE 2: SCHEMA & TYPE VALIDATION (400) ---
  console.log(chalk.cyan('\n--- Phase 2: Schema & Type Validation ---'));

  await runTest('PATCH /profile/me (Invalid Type - Number for Bio)', async () => {
    try {
      await axios.patch(`${BASE_URL}/profile/me`, { bio: 12345 }, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response.status !== 400) throw err;
    }
  });

  await runTest('POST /questionnaire/answers (Empty Body)', async () => {
    try {
      await axios.post(`${BASE_URL}/questionnaire/answers`, {}, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response.status !== 400) throw err;
    }
  });

  // --- PHASE 3: SECURITY & AUTH (401/403) ---
  console.log(chalk.cyan('\n--- Phase 3: Security & Auth ---'));

  await runTest('GET /profile/me (Missing Auth Header)', async () => {
    try {
      await axios.get(`${BASE_URL}/profile/me`);
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response.status !== 401) throw err;
    }
  });

  await runTest('GET /admin/dashboard/stats (User Token accessing Admin API)', async () => {
    try {
      await axios.get(`${BASE_URL}/admin/dashboard/stats`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      throw new Error('Should have failed');
    } catch (err) {
      if (err.response.status !== 401 && err.response.status !== 403) throw err;
    }
  });

  // --- PHASE 4: THE EDGE CASE HAMMER ---
  console.log(chalk.cyan('\n--- Phase 4: Edge Case Hammer ---'));

  await runTest('GET /questionnaire (Return [] or 200 even with no data)', async () => {
    const res = await axios.get(`${BASE_URL}/questionnaire`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    if (res.status !== 200) throw new Error('Failed');
  });

  console.log(chalk.bold.blue('\n✅ AUDIT COMPLETE. See results above.\n'));
}

startAudit();
