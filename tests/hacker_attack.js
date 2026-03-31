async function runHackerTests() {
  const BASE_URL = 'http://localhost:3000/api/v1/auth';
  const email = 'hacker_test@example.com';

  console.log('--- 🛡️ LIVE SECURITY AUDIT STARTING ---');

  // 1. TEST SIGNUP (Establish a baseline)
  console.log('\n[1] Attempting to create a test user...');
  const signupRes = await fetch(`${BASE_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacker Target', email, password: 'password123' })
  });
  console.log(`Signup Status: ${signupRes.status}`);

  // 2. TEST RATE LIMITING (Brute Force Simulation)
  console.log('\n[2] Attempting 25 rapid failed logins to trigger Rate Limiter (Max: 20)...');
  for (let i = 1; i <= 25; i++) {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong' })
    });
    if (res.status === 429) {
      console.log(`✅ SUCCESS: Rate Limiter triggered at attempt ${i} (Status: 429)`);
      break;
    }
    if (i === 25) console.log('❌ FAILURE: Rate Limiter did NOT trigger after 25 attempts!');
  }

  // 3. TEST OTP BRUTE FORCE (Database Lockout Simulation)
  console.log('\n[3] Triggering Forgot Password and testing OTP Lockout (Max: 5)...');
  await fetch(`${BASE_URL}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  for (let i = 1; i <= 7; i++) {
    const res = await fetch(`${BASE_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: '000000' })
    });
    const data = await res.json();
    if (res.status === 429) {
      console.log(`✅ SUCCESS: OTP Brute Force Lockout triggered at attempt ${i} (Status: 429)`);
      console.log(`Server Msg: ${data.message}`);
      break;
    }
    if (i === 7) console.log('❌ FAILURE: OTP Lockout did NOT trigger after 7 attempts!');
  }

  // 4. TEST SQL INJECTION
  console.log('\n[4] Attempting SQL Injection in login payload...');
  const sqliRes = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: "' OR 1=1 --", password: 'any' })
  });
  console.log(`SQLi Response Status: ${sqliRes.status} (Expected 401 or 400, NOT 200)`);

  console.log('\n--- 🛡️ LIVE SECURITY AUDIT COMPLETE ---');
}

runHackerTests().catch(err => console.error('Test Error:', err));
