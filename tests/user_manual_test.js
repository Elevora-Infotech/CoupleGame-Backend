const BASE_URL = 'http://localhost:3000/api/v1/auth';
const email = 'nikhilbhor201@gmail.com';
const password = 'EleVoraTest2026!';
const name = 'nikil';

async function runManualTest() {
  console.log('--- 🚀 USER LIVE TEST STARTING ---');

  // 1. SIGNUP
  console.log(`\n[1] Creating account for ${name} (${email})...`);
  const signupRes = await fetch(`${BASE_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const signupData = await signupRes.json();
  console.log(`Signup Status: ${signupRes.status}`);
  console.log(`Message: ${signupData.message}`);

  // 2. LOGIN
  console.log(`\n[2] Testing Login...`);
  const loginRes = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  console.log(`Login Status: ${loginRes.status}`);

  // 3. FORGOT PASSWORD (Trigger real email)
  console.log(`\n[3] Triggering Forgot Password (dispatching real OTP to Gmail)...`);
  const forgotRes = await fetch(`${BASE_URL}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const forgotData = await forgotRes.json();
  console.log(`Forgot Password Status: ${forgotRes.status}`);
  console.log(`Server Response: ${forgotData.message}`);

  console.log('\n--- ✅ STEP 1-3 COMPLETE. WAITING FOR USER OTP ---');
}

runManualTest().catch(err => console.error('Test Error:', err));
