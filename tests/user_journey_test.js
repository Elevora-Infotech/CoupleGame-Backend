const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = 'http://localhost:3000/api/v1';

// Same User Credentials from previous QA tests
const USER_CREDENTIALS = {
  email: 'nikhilbhor201@gmail.com',
  password: 'securepassword123'
};

async function userJourneyTest() {
  console.log(chalk.bold.blue('\n🚶 STARTING USER JOURNEY: LOGIN -> FETCH -> ANSWER...\n'));

  try {
    // 1. LOGIN
    console.log(chalk.yellow('Step 1: Logging in...'));
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, USER_CREDENTIALS);
    const token = loginRes.data.data.accessToken;
    console.log(chalk.green('✔ SUCCESS: Logged in. Token obtained.\n'));

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // 2. FETCH QUESTIONNAIRE
    console.log(chalk.yellow('Step 2: Fetching Questionnaire...'));
    const questRes = await axios.get(`${BASE_URL}/questionnaire`, authHeader);
    const questions = questRes.data.data.questions;
    console.log(chalk.green(`✔ SUCCESS: Fetched ${questions.length} questions.\n`));

    // 3. PREPARE ANSWERS
    console.log(chalk.yellow('Step 3: Preparing answers...'));
    
    // We'll answer the first 2 questions for this test
    const answers = [];
    
    // Q1: Duration (Less than 1 year)
    if (questions && questions[0]) {
      const q1 = questions[0];
      const opt1 = q1.question_options[0];
      answers.push({
        question_id: q1.id,
        selected_option_id: opt1.id
      });
      console.log(chalk.gray(`- Answering "${q1.text}" with "${opt1.option_text}"`));
    }

    // Q2: Living Together (Yes)
    if (questions && questions[1]) {
      const q2 = questions[1];
      const optYes = q2.question_options.find(o => o.option_text === 'Yes');
      if (optYes) {
        answers.push({
          question_id: q2.id,
          selected_option_id: optYes.id
        });
        console.log(chalk.gray(`- Answering "${q2.text}" with "Yes"`));
      }
    }

    // 4. SUBMIT ANSWERS
    console.log(chalk.yellow('\nStep 4: Submitting Answers...'));
    const submitRes = await axios.post(`${BASE_URL}/questionnaire/answers`, { answers }, authHeader);
    console.log(chalk.green('✔ SUCCESS: Answers submitted/updated in Supabase.\n'));

    // 5. VERIFY DB (FETCH MY ANSWERS)
    console.log(chalk.yellow('Step 5: Verifying DB state (Fetching my-answers)...'));
    const verifyRes = await axios.get(`${BASE_URL}/questionnaire/my-answers`, authHeader);
    const savedAnswers = verifyRes.data.data.answers;
    console.log(chalk.cyan(`DB Record Count: ${savedAnswers.length}`));
    console.log(chalk.bold.green('\n🏁 USER JOURNEY COMPLETE: DATA SAVED!\n'));

  } catch (error) {
    if (error.response) {
      console.log(chalk.red(`✘ FAIL: status ${error.response.status}`));
      console.log(chalk.red(`Data: ${JSON.stringify(error.response.data)}`));
    } else {
      console.log(chalk.red(`✘ ERROR: ${error.message}`));
    }
  }
}

userJourneyTest();
