# 📱 EleVora: User App (Frontend) API Integration Guide

This document is the **Master Reference** for the Mobile/Web Frontend Developers building the main EleVora Couple Game App. It contains every API endpoint, required headers, and exact JSON payloads.

---

## 🌍 Base URL
`http://localhost:3000/api/v1` (Update this to your production URL later)

## 🔐 Authentication Header
Almost all routes (except login/signup) require a Bearer token.
```http
Authorization: Bearer <your_access_token>
```

---

## 1️⃣ Authentication Flow (`/auth`)

### 1.1 Sign Up (Email/Password)
- **Endpoint**: `POST /auth/signup`
- **Access**: Public
- **Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```
- **Response**: Returns the user object + `accessToken` + `refreshToken`. The First Name is automatically parsed to create a default Profile.

### 1.2 Login (Email/Password)
- **Endpoint**: `POST /auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

### 1.3 Google Sign-In
- **Endpoint**: `POST /auth/google`
- **Access**: Public
- **Request Body**:
```json
{
  "token": "GOOGLE_ID_TOKEN_FROM_CLIENT_SDK"
}
```

### 1.4 Refresh Token (When Access Token Expires)
- **Endpoint**: `POST /auth/refresh`
- **Access**: Public
- **Request Body**:
```json
{
  "refreshToken": "<your_refresh_token>"
}
```

### 1.5 Forgot Password & OTP Flow
1. **Request OTP**: `POST /auth/forgot-password` | Body: `{ "email": "user@example.com" }`
2. **Verify OTP**: `POST /auth/verify-otp` | Body: `{ "email": "user@example.com", "otp": "123456" }`
3. **Reset Password**: `POST /auth/reset-password` | Body: `{ "email": "user@example.com", "otp": "123456", "newPassword": "newPass123" }`

---

## 2️⃣ Profile Management (`/profile`)

### 2.1 Get My Profile
- **Endpoint**: `GET /profile/me`
- **Access**: Private (Requires Token)
- **Response**: Returns `first_name`, `last_name`, `avatar_url`, `bio`, `date_of_birth`, and `preferences` (JSON default: `{"theme": "dark"}`).

### 2.2 Update Profile
- **Endpoint**: `PATCH /profile/me`
- **Access**: Private (Requires Token)
- **Request Body (Send only what you want to change)**:
```json
{
  "first_name": "Johnny",
  "bio": "Ready to play the couple game!",
  "avatar_url": "https://supabase.com/storage/v1/object/public/avatars/uuid-file.png"
}
```
> **Avatar Upload Tip**: The frontend should upload the raw image directly to the Supabase `avatars` bucket first using the Supabase JS Client, get the public URL, and then send that URL to this endpoint.

---

## 3️⃣ Onboarding / Questionnaire (`/questionnaire`)

### 3.1 Fetch All Active Questions
- **Endpoint**: `GET /questionnaire`
- **Access**: Private (Requires Token)
- **Response Example**:
```json
{
  "status": "success",
  "data": {
    "questions": [
      {
        "id": "q-1234",
        "text": "What is your relationship status?",
        "input_type": "SINGLE_CHOICE",
        "order_index": 1,
        "question_options": [
          { "id": "opt-1", "option_text": "Dating", "order_index": 1 },
          { "id": "opt-2", "option_text": "Married", "order_index": 2 }
        ],
        "question_dependencies": []
      }
    ]
  }
}
```
*Note: `input_type` can be `SINGLE_CHOICE`, `MULTI_CHOICE`, `TEXT`, or `SLIDER`.*

### 3.2 Submit Answers (Upsert)
- **Endpoint**: `POST /questionnaire/answers`
- **Access**: Private (Requires Token)
- **Request Body (Array of answers)**:
```json
{
  "answers": [
    {
      "question_id": "q-1234",
      "selected_option_id": "opt-2",
      "text_value": null
    },
    {
      "question_id": "q-5678",
      "selected_option_id": null,
      "text_value": "My favorite memory is our trip to Bali" 
    }
  ]
}
```
*Note: If the user answers the same question twice, the backend automatically updates their old answer instead of throwing an error.*

### 3.3 Get My Previous Answers
- **Endpoint**: `GET /questionnaire/my-answers`
- **Access**: Private (Requires Token)
- **Response**: Returns an array of answers the current user has already submitted. Use this to pre-fill the UI if they reopen the app during onboarding.
