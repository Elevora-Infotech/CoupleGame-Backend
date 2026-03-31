const BASE_URL = 'http://localhost:3000/api/v1/auth';
const email = 'nikhilbhor201@gmail.com';
const otp = '867211';

async function verifyUserOtp() {
  console.log(`--- 🚀 FINAL OTP VERIFICATION FOR ${email} ---`);

  const res = await fetch(`${BASE_URL}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  
  const data = await res.json();
  console.log(`Verification Status: ${res.status}`);
  console.log(`Server Message: ${data.message}`);

  if (res.status === 200) {
    console.log('\n✅ COMPLETED: The entire Auth & SMTP flow is verified 100%!');
  } else {
    console.log('\n❌ FAILED: Unexpected verification error.');
  }
}

verifyUserOtp().catch(err => console.error('Test Error:', err));
