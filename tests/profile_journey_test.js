const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = 'http://localhost:3000/api/v1';

// Same User Credentials from the Questionnaire test
const USER_CREDENTIALS = {
  email: 'nikhilbhor201@gmail.com',
  password: 'securepassword123'
};

// Mock Avatar URL (Using the generated banana image)
const BANANA_AVATAR_URL = 'https://supabase.com/storage/v1/object/public/avatars/banana_avatar.png';

async function profileJourneyTest() {
  console.log(chalk.bold.blue('\n👤 STARTING PROFILE JOURNEY: LOGIN -> UPDATE -> FETCH...\n'));

  try {
    // 1. LOGIN
    console.log(chalk.yellow('Step 1: Logging in...'));
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, USER_CREDENTIALS);
    const token = loginRes.data.data.accessToken;
    console.log(chalk.green('✔ SUCCESS: Logged in.\n'));

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // 2. UPDATE PROFILE (With Banana Avatar)
    console.log(chalk.yellow('Step 2: Updating Profile with Banana data...'));
    const updateData = {
      first_name: 'Nikhil',
      last_name: 'Banana',
      bio: 'I am a sleek, 3D animated banana.',
      avatar_url: BANANA_AVATAR_URL,
      date_of_birth: '1995-10-24',
      preferences: { "theme": "vibrant_yellow" }
    };

    const updateRes = await axios.patch(`${BASE_URL}/profile/me`, updateData, authHeader);
    console.log(chalk.green('✔ SUCCESS: Profile updated with Banana avatar and bio.\n'));

    // 3. FETCH PROFILE (Verification)
    console.log(chalk.yellow('Step 3: Fetching Profile to verify all data...'));
    const profileRes = await axios.get(`${BASE_URL}/profile/me`, authHeader);
    const profile = profileRes.data.data.profile;

    console.log(chalk.cyan('--- Final Profile Data ---'));
    console.log(`- Name: ${profile.first_name} ${profile.last_name}`);
    console.log(`- Bio: ${profile.bio}`);
    console.log(`- Avatar: ${profile.avatar_url}`);
    console.log(`- DOB: ${profile.date_of_birth}`);
    console.log(`- Theme: ${profile.preferences.theme}`);
    console.log(chalk.cyan('--------------------------'));

    console.log(chalk.bold.green('\n🏁 PROFILE JOURNEY COMPLETE: DATA IS FULLY SYNCED!\n'));

  } catch (error) {
    if (error.response) {
      console.log(chalk.red(`✘ FAIL: status ${error.response.status}`));
      console.log(chalk.red(`Data: ${JSON.stringify(error.response.data)}`));
    } else {
      console.log(chalk.red(`✘ ERROR: ${error.message}`));
    }
  }
}

profileJourneyTest();
