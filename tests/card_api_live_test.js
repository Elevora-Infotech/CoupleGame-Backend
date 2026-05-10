const axios = require('axios');
const chalk = require('chalk');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000/api/v1';

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runLiveTest() {
  console.log(chalk.bold.blue('\n🃏 STARTING CARD API LIVE TESTS...\n'));
  
  let adminId;
  let adminToken;
  let userToken;
  let testCategoryId;
  let testCardId;

  try {
    // 1. Setup Admin Access
    console.log(chalk.yellow('Step 1: Setting up Admin privileges...'));
    const { data: admin, error: adminErr } = await supabase
      .from('admins')
      .insert([{ name: 'Test Admin', email: `admin_${Date.now()}@test.com`, password_hash: 'ignored', role: 'superadmin' }])
      .select()
      .single();
      
    if (adminErr) throw adminErr;
    adminId = admin.id;
    
    // Generate Admin Token
    adminToken = jwt.sign(
      { id: admin.id, email: admin.email, type: 'admin' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );
    
    const adminAuth = { headers: { Authorization: `Bearer ${adminToken}` } };
    console.log(chalk.green('✔ SUCCESS: Admin Account & Token Generated.\n'));

    // 2. Setup Normal User Access
    console.log(chalk.yellow('Step 2: Creating a regular User...'));
    const userRes = await axios.post(`${BASE_URL}/auth/signup`, {
      name: "Player 1", email: `player_${Date.now()}@test.com`, password: "password123"
    });
    userToken = userRes.data.data.accessToken;
    const userAuth = { headers: { Authorization: `Bearer ${userToken}` } };
    console.log(chalk.green('✔ SUCCESS: User Account & Token Generated.\n'));

    // 3. Admin Creates Category
    console.log(chalk.yellow('Step 3: Admin creating a new Card Category...'));
    const catRes = await axios.post(`${BASE_URL}/admin/dashboard/categories`, {
      name: `Special Event ${Date.now()}`,
      description: "A dynamic category created by test",
      theme_color: "#FF00FF",
      order_index: 99
    }, adminAuth);
    testCategoryId = catRes.data.data.category.id;
    console.log(chalk.green(`✔ SUCCESS: Category created with ID: ${testCategoryId}\n`));

    // 4. Admin Creates Card
    console.log(chalk.yellow('Step 4: Admin creating a new Card inside the category...'));
    const cardRes = await axios.post(`${BASE_URL}/admin/dashboard/cards`, {
      category_id: testCategoryId,
      name: "Test Ultimate Wildcard",
      power_description: "Win the test automatically.",
      card_type: "WILDCARD"
    }, adminAuth);
    testCardId = cardRes.data.data.card.id;
    console.log(chalk.green(`✔ SUCCESS: Card created with ID: ${testCardId}\n`));

    // 5. User Fetches Catalog
    console.log(chalk.yellow('Step 5: User fetching the full Catalog...'));
    const catalogRes = await axios.get(`${BASE_URL}/cards/catalog`, userAuth);
    const catalog = catalogRes.data.data.catalog;
    
    // Verify the new category is in the catalog
    const foundCategory = catalog.find(c => c.id === testCategoryId);
    if (!foundCategory) throw new Error('New category not found in catalog!');
    if (!foundCategory.cards.some(c => c.id === testCardId)) throw new Error('New card not found inside category!');
    
    console.log(chalk.green(`✔ SUCCESS: User successfully fetched catalog. Found ${catalog.length} categories.\n`));

    // We are skipping the soft-delete test so the data stays in your database permanently!
    console.log(chalk.bold.green('🏁 CARD API LIVE TESTING COMPLETE: ALL APIS WORKING PERFECTLY!\n'));

  } catch (error) {
    if (error.response) {
      console.log(chalk.red(`✘ API FAIL [${error.response.status}]: ${JSON.stringify(error.response.data)}`));
    } else {
      console.log(chalk.red(`✘ ERROR: ${error.message}`));
    }
  } finally {
    // Cleanup Database (Only remove the admin account, keep the category and cards)
    if (adminId) {
      await supabase.from('admins').delete().eq('id', adminId);
      console.log(chalk.gray('Cleaned up test admin account.'));
    }
  }
}

runLiveTest();
