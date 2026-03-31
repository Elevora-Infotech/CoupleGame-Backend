# EleVora: Frontend Onboarding Integration Guide

This guide explains how to integrate the dynamic onboarding/questionnaire system into the EleVora mobile or web application.

---

## 🏗️ 1. Fetching the Questionnaire

To display the onboarding screens, the app must fetch all "Active" questions.

### Endpoint: `GET /api/v1/questionnaire`
- **Requires Authentication**: Yes (Bearer Token)
- **Response Format**:
```json
{
  "status": "success",
  "data": {
    "questions": [
      {
        "id": "uuid-123",
        "text": "Are you married?",
        "input_type": "SINGLE_CHOICE",
        "order_index": 1,
        "question_options": [
          { "id": "opt-1", "option_text": "Yes", "order_index": 1 },
          { "id": "opt-2", "option_text": "No", "order_index": 2 }
        ],
        "question_dependencies": []
      }
    ]
  }
}
```

### 💡 Frontend Tip:
- **SINGLE_CHOICE**: Render as Radio Buttons or clickable cards.
- **TEXT**: Render a `<textarea>`.
- **SLIDER**: Render a range slider (use `text_value` for the number).

---

## 💾 2. Submitting Answers

You can submit one or all answers at once. If you submit a `question_id` that was already answered, the backend will **Update** the old answer automatically.

### Endpoint: `POST /api/v1/questionnaire/answers`
- **Requires Authentication**: Yes
- **Request Body**:
```json
{
  "answers": [
    {
      "question_id": "uuid-123",
      "selected_option_id": "opt-1",
      "text_value": null
    },
    {
      "question_id": "uuid-456",
      "selected_option_id": null,
      "text_value": "Wedding in Paris"
    }
  ]
}
```

---

## 🖼️ 3. Handling User Profiles

Use these APIs to manage user metadata like names and avatars.

### Get Stats / Profile: `GET /api/v1/profile/me`
### Update Profile: `PATCH /api/v1/profile/me`

### 💡 Avatar Upload Flow (Recommended):
1.  **Select Photo**: User picks a photo on the mobile app.
2.  **Direct Upload**: The app uploads the file directly to Supabase Storage: `avatars/{user_id}/profile.png`.
3.  **Get Public URL**: Get the URL from Supabase (e.g., `https://supabase.com/.../profile.png`).
4.  **Save to DB**: Call `PATCH /api/v1/profile/me` with `{"avatar_url": "the_new_url"}`.

---

## ⚡ 4. Error Handling
- **401**: Unauthorized (Token expired).
- **400**: Validation Error (Check JSON format).
- **429**: Rate Limited (Too many requests).
