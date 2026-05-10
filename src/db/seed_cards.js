const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const categories = [
  { name: 'Communication & Emotional Safety', theme_color: '#4A90E2', order_index: 1 },
  { name: 'Romance, Intimacy & Desire', theme_color: '#D0021B', order_index: 2 },
  { name: 'Conflict, Repair & Healing', theme_color: '#F5A623', order_index: 3 },
  { name: 'Fun, Play & Novelty', theme_color: '#F8E71C', order_index: 4 },
  { name: 'Support, Care & Acts of Love', theme_color: '#7ED321', order_index: 5 },
  { name: 'Growth, Future & Partnership', theme_color: '#BD10E0', order_index: 6 },
  { name: 'Power, Wildcards & Game Mechanics', theme_color: '#000000', order_index: 7 }
];

const cardsData = [
  // 1. Communication & Emotional Safety
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Heart-to-Heart Hour', power: 'Ask 3 deep questions; both must answer honestly.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Ask Me Anything', power: 'Ask 2 unfiltered questions; no dodging allowed.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Emoji Decoder', power: 'Send 3 emojis to express today’s mood and explain them.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Voice Memo Vibes', power: 'Send each other a 1-min emotional voice note.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'The Honest Hour', power: 'Say 3 truths you’ve never told before.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Unsent Letter', power: 'Read a supportive letter you think your partner once needed.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Flashback Reel', power: 'Choose a photo and discuss what you never said back then.' },
  { cat: 'Communication & Emotional Safety', type: 'ACTION', name: 'Mute & Notice', power: 'Sit silently for 5 mins, then share what you observed.' },
  
  // 2. Romance, Intimacy & Desire
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'Slow-Mo Kiss', power: 'Kiss for 30 seconds, no distractions.' },
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'Love Letter Live', power: 'Write and read a love letter on the spot.' },
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'Touch Tag', power: 'Stay in physical contact for 1 hour.' },
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'Compliment Countdown', power: 'One compliment every minute for 10 mins.' },
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'The Strip Tease Card', power: 'One private dance to a song of your choice.' },
  { cat: 'Romance, Intimacy & Desire', type: 'ACTION', name: 'Yes Day (Romance Edition)', power: 'Say "yes" to all romantic requests for 1 hour.' },

  // 3. Conflict, Repair & Healing
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'Bicker Timeout', power: 'No passive aggression for 3 hours.' },
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'The Apology Exchange', power: 'Each offers one sincere apology.' },
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'Resentment Dump', power: 'Write down 1 small resentment and burn it.' },
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'Pattern Spotter', power: 'Discuss a recurring argument and its emotional root.' },
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'Blame Pass', power: 'Today, neither can say "you always" or "you never".' },
  { cat: 'Conflict, Repair & Healing', type: 'ACTION', name: 'Judgment Detox', power: 'No criticism allowed for 1 day.' },

  // 4. Fun, Play & Novelty
  { cat: 'Fun, Play & Novelty', type: 'ACTION', name: 'Accent All Day', power: 'Choose an accent and stick to it.' },
  { cat: 'Fun, Play & Novelty', type: 'ACTION', name: 'Weird Food Combo Challenge', power: 'Invent and taste-test 3 new food combos.' },
  { cat: 'Fun, Play & Novelty', type: 'ACTION', name: 'Whisper-Only Hour', power: 'Communicate only in whispers for an hour.' },
  { cat: 'Fun, Play & Novelty', type: 'ACTION', name: 'Giggler’s Game', power: 'First to laugh loses the round.' },
  { cat: 'Fun, Play & Novelty', type: 'ACTION', name: 'Meme Battle', power: 'Find 3 memes that describe each other.' },
  
  // 5. Support, Care & Acts of Love
  { cat: 'Support, Care & Acts of Love', type: 'ACTION', name: 'Task Ninja', power: 'Swap a dreaded chore today.' },
  { cat: 'Support, Care & Acts of Love', type: 'ACTION', name: 'Hydration Station', power: 'Partner must keep your cup full all day.' },
  { cat: 'Support, Care & Acts of Love', type: 'ACTION', name: 'Massage Parlor', power: 'Full-body massage, hot towel included.' },
  { cat: 'Support, Care & Acts of Love', type: 'ACTION', name: 'Digital Detox Duo', power: 'No phones/screens for 2 hours.' },

  // 6. Growth, Future & Partnership
  { cat: 'Growth, Future & Partnership', type: 'ACTION', name: 'Gratitude Flash', power: 'Share 5 things you appreciate.' },
  { cat: 'Growth, Future & Partnership', type: 'ACTION', name: 'Future Letter', power: 'Write a letter to read a year from now.' },
  { cat: 'Growth, Future & Partnership', type: 'ACTION', name: 'Relationship Checkup', power: 'Rank your connection in 5 areas and reflect.' },
  { cat: 'Growth, Future & Partnership', type: 'ACTION', name: 'Bucket List Build', power: 'Create a joint 5-item bucket list.' },

  // 7. Power, Wildcards & Game Mechanics
  { cat: 'Power, Wildcards & Game Mechanics', type: 'DEFENSE', name: 'Not Today Satan', power: 'Block any card, can’t be blocked back.' },
  { cat: 'Power, Wildcards & Game Mechanics', type: 'DEFENSE', name: 'Big Fat No', power: 'Cancel any one card being played.' },
  { cat: 'Power, Wildcards & Game Mechanics', type: 'REACTION', name: 'Reverse Uno', power: 'Cancel the last card played.' },
  { cat: 'Power, Wildcards & Game Mechanics', type: 'WILDCARD', name: 'Switcheroo', power: 'Use your partner’s card against them.' },
  { cat: 'Power, Wildcards & Game Mechanics', type: 'WILDCARD', name: 'Reset Deck', power: 'All cards return to full power.' },
  { cat: 'Power, Wildcards & Game Mechanics', type: 'DEFENSE', name: 'Shield Mode', power: 'Immune to any card for 1 hour.' }
];

async function seedCards() {
  console.log('🌱 Starting Database Seed...');

  // 1. Insert Categories
  for (const c of categories) {
    await supabase.from('card_categories').upsert({
      name: c.name,
      theme_color: c.theme_color,
      order_index: c.order_index
    }, { onConflict: 'name' });
  }
  console.log('✔ Categories seeded.');

  // Fetch Category IDs
  const { data: dbCategories } = await supabase.from('card_categories').select('*');
  const catMap = {};
  dbCategories.forEach(c => catMap[c.name] = c.id);

  // 2. Insert Cards
  for (const card of cardsData) {
    const category_id = catMap[card.cat];
    if (!category_id) continue;

    await supabase.from('cards').insert({
      category_id,
      name: card.name,
      power_description: card.power,
      card_type: card.type
    });
  }
  
  console.log(`✔ Inserted ${cardsData.length} cards.`);
  console.log('✅ Seed complete!');
}

seedCards();
