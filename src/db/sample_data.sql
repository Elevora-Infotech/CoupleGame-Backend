-- ==========================================
-- EleVora: Sample Questionnaire Data
-- ==========================================

-- 1. Clear existing data (for clean test)
TRUNCATE public.questions, public.question_options, public.question_dependencies, public.user_answers RESTART IDENTITY CASCADE;

-- 2. Question: Gender
INSERT INTO public.questions (id, text, input_type, order_index)
VALUES ('7b7e8d9a-1c2d-4e5f-a6b7-c8d9e0f1a2b3', 'What is your gender?', 'SINGLE_CHOICE', 1);

INSERT INTO public.question_options (question_id, option_text, order_index)
VALUES 
  ('7b7e8d9a-1c2d-4e5f-a6b7-c8d9e0f1a2b3', 'Male', 1),
  ('7b7e8d9a-1c2d-4e5f-a6b7-c8d9e0f1a2b3', 'Female', 2),
  ('7b7e8d9a-1c2d-4e5f-a6b7-c8d9e0f1a2b3', 'Other', 3);

-- 3. Question: Relationship Status
INSERT INTO public.questions (id, text, input_type, order_index)
VALUES ('8c8f9e0a-2d3e-5f6g-b7c8-d9e0f1a2b3c4', 'Your current relationship status?', 'SINGLE_CHOICE', 2);

INSERT INTO public.question_options (question_id, option_text, order_index)
VALUES 
  ('8c8f9e0a-2d3e-5f6g-b7c8-d9e0f1a2b3c4', 'Dating', 1),
  ('8c8f9e0a-2d3e-5f6g-b7c8-d9e0f1a2b3c4', 'Married', 2),
  ('8c8f9e0a-2d3e-5f6g-b7c8-d9e0f1a2b3c4', 'Long Distance', 3);

-- 4. Question: How long have you been together?
INSERT INTO public.questions (id, text, input_type, order_index)
VALUES ('9d9g0h1b-3e4f-6g7h-c8d9-e0f1a2b3c4d5', 'How many years have you been together?', 'SLIDER', 3);

-- 5. Dependency Logic: (Only show Q6 if they pick 'Married' in Q3)
-- First, add the Child Question
INSERT INTO public.questions (id, text, input_type, order_index)
VALUES ('0e0h1i2c-4f5g-7h8i-d9e0-f1a2b3c4d5e6', 'Where was your wedding held?', 'TEXT', 4);

-- Now link it to Q3 "Married" option
-- Note: You'll need the exact UUID of the 'Married' option to do this in SQL.
-- For now, let's keep it simple.

-- 6. Question: Favorite Memory
INSERT INTO public.questions (id, text, input_type, order_index)
VALUES ('1f1i2j3d-5g6h-8i9j-e0f1-a2b3c4d5e6f7', 'What is your favorite memory together?', 'TEXT', 5);
