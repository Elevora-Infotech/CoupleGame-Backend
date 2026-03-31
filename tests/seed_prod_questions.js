const { supabase } = require('../src/db/supabase');

async function seedRealQuestions() {
  console.log('🚀 Seeding Production-Ready Questions to Supabase...');

  // 1. Delete existing (clean slate)
  await supabase.from('question_dependencies').delete().neq('parent_question_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('question_options').delete().neq('option_text', '');
  await supabase.from('questions').delete().neq('text', '');

  // 2. Insert Base Questions
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .insert([
      { text: 'How long have you been together?', input_type: 'SINGLE_CHOICE', order_index: 1 },
      { text: 'Do you currently live together?', input_type: 'SINGLE_CHOICE', order_index: 2 },
      { text: 'What is your primary relationship goal?', input_type: 'SINGLE_CHOICE', order_index: 3 },
      { text: 'Rate your current communication (1-10)?', input_type: 'SLIDER', order_index: 4 },
      { text: 'Specify your address (Since you live together)?', input_type: 'TEXT', order_index: 5 }
    ])
    .select();

  if (qErr) return console.error('Question Error:', qErr);

  const [qDuration, qLiving, qGoal, qComm, qAddress] = questions;

  // 3. Insert Options
  const { data: options, error: oErr } = await supabase
    .from('question_options')
    .insert([
      // Duration
      { question_id: qDuration.id, option_text: 'Less than 1 year', order_index: 1 },
      { question_id: qDuration.id, option_text: '1-3 years', order_index: 2 },
      { question_id: qDuration.id, option_text: '3+ years', order_index: 3 },
      // Living
      { question_id: qLiving.id, option_text: 'Yes', order_index: 1 },
      { question_id: qLiving.id, option_text: 'No', order_index: 2 }
    ])
    .select();

  if (oErr) return console.error('Option Error:', oErr);

  // 4. Insert Dependency
  // Question 5 (Address) only shows if Question 2 (Living) is 'Yes'
  const yesOption = options.find(o => o.option_text === 'Yes' && o.question_id === qLiving.id);
  
  const { error: dErr } = await supabase
    .from('question_dependencies')
    .insert([
      { 
        parent_question_id: qLiving.id, 
        child_question_id: qAddress.id, 
        required_option_id: yesOption.id 
      }
    ]);

  if (dErr) console.error('Dependency Error:', dErr);
  else console.log('✅ SEEDING COMPLETE: 5 Questions, Options, and 1 Branching Logic Dependency added.');

  process.exit(0);
}

seedRealQuestions();
