# 📱 EleVora: User API Technical Specifications

**Version**: 1.1.0  
**Architect**: Staff Software Engineer  
**Status**: Production-Ready  

---

## 🧩 Table of Contents
- [GET | /profile/me | GET_MY_PROFILE](#get--profileme--get_my_profile)
- [PATCH | /profile/me | UPDATE_MY_PROFILE](#patch--profileme--update_my_profile)
- [GET | /questionnaire | FETCH_QUESTIONNAIRE](#get--questionnaire--fetch_questionnaire)
- [POST | /questionnaire/answers | SUBMIT_ANSWERS](#post--questionnaireanswers--submit_answers)

---

## GET | /profile/me | GET_MY_PROFILE

### 1. Context
Used following initial login or app foregrounding to synchronize the local state with the user's latest server-side profile data (Bio, Avatar, etc.).

### 2. Security/Auth
*   **Auth Type**: JWT (Access Token)
*   **Header**: `Authorization: Bearer <JWT>`

### 3. RBAC
*   **Permitted**: `owner` (The logged-in user can only fetch their own profile).

### 4. Rate Limiting
*   **Global Limit**: 100 requests per 15 minutes.

### 5. The Request Contract
*   **Headers**: 
    - `Content-Type: application/json`
    - `Authorization: Bearer {{ACCESS_TOKEN}}`
*   **Path/Query Params**: None.
*   **Request Body**: None (READ-ONLY).

### 6. The Success Contract (200 OK)
```json
{
  "status": "success",
  "data": {
    "profile": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "first_name": "Nikhil",
      "last_name": "Bhor",
      "avatar_url": "https://supabase.com/storage/v1/object/public/avatars/nikhil.png",
      "bio": "Couple game enthusiast",
      "date_of_birth": "1995-05-15",
      "preferences": { "theme": "dark" },
      "users": {
        "email": "nikhilbhor201@gmail.com",
        "name": "Nikhil Bhor",
        "created_at": "2024-03-26T12:00:00Z"
      }
    }
  }
}
```
*   **Data Types**: 
    - `id`: UUID (String)
    - `avatar_url`: URI (String)
    - `date_of_birth`: ISO-8601 Date (YYYY-MM-DD)
    - `created_at`: ISO-8601 Timestamp
*   **Nullability**: 
    - `last_name`, `bio`, `date_of_birth`, `avatar_url` can be **null** if not yet set by the user. `preferences` defaults to `{}` but is never null.

### 7. The Error Contract
| HTTP Code | Internal_Error_Slug | Frontend_Display_Message | Suggested_Action |
| :--- | :--- | :--- | :--- |
| 401 | `ERR_AUTH_UNAUTHORIZED` | Your session has expired. | Redirect to Login. |
| 404 | `ERR_PROFILE_NOT_FOUND` | Profile not found. | Contact Support. |

### 8. State Management & Side Effects
*   **DB**: Read-only query on `profiles` joined with `users`.
*   **Events**: None.

### 9. Frontend Implementation Logic
*   **Caching**: Cache locally for **5 minutes**. Re-fetch on manual "Pull to Refresh".
*   **Optimistic UI**: N/A (Read only).
*   **Edge Cases**: If `first_name` is null, use `users.name` as fallback.

### 10. cURL Snippet
```bash
curl --location --request GET 'http://localhost:3000/api/v1/profile/me' \
--header 'Authorization: Bearer {{ACCESS_TOKEN}}'
```

---

## PATCH | /profile/me | UPDATE_MY_PROFILE

### 1. Context
Updates the user's biographical and identity data. Triggers a sync to the base `users` table for name consistency.

### 2. Security/Auth
*   **Auth Type**: JWT (Access Token).

### 3. RBAC
*   **Permitted**: `owner`.

### 4. Rate Limiting
*   **Limit**: 20 requests per 15 minutes.

### 5. The Request Contract
*   **Request Body (Strict Schema)**:
```json
{
  "first_name": "string (optional)",
  "last_name": "string (optional)",
  "avatar_url": "uri (optional)",
  "bio": "string (optional, max 500)",
  "date_of_birth": "iso-date (optional)",
  "preferences": "object (optional)"
}
```

### 6. The Success Contract (200 OK)
*   **JSON Example**: Returns the updated profile object.
*   **Nullability**: Provided fields update the DB; missing fields remain unchanged.

### 7. The Error Contract
| HTTP Code | Internal_Error_Slug | Frontend_Display_Message | Suggested_Action |
| :--- | :--- | :--- | :--- |
| 400 | `ERR_VALIDATION_FAILED` | Please check your input. | Show field-specific error. |

### 8. State Management & Side Effects
*   **DB**: Updates `profiles` table. If `first_name`/`last_name` provided, updates `users.name` string.

### 9. Frontend Implementation Logic
*   **Caching**: Invalidate `GET_MY_PROFILE` cache immediately.
*   **Optimistic UI**: **YES**. Update local Redux/State immediately. Rollback on 4xx/5xx.

### 10. cURL Snippet
```bash
curl --location --request PATCH 'http://localhost:3000/api/v1/profile/me' \
--header 'Authorization: Bearer {{ACCESS_TOKEN}}' \
--header 'Content-Type: application/json' \
--data-raw '{ "first_name": "Nikhil", "bio": "Updated Bio" }'
```

---

## GET | /questionnaire | FETCH_QUESTIONNAIRE

### 1. Context
Fetches the full set of active questions and options to initialize the onboarding flow.

### 2. Security/Auth
*   **Auth Type**: JWT (Access Token).

### 3. RBAC
*   **Permitted**: Any authenticated user.

### 6. The Success Contract (200 OK)
*   **Nullability**: `question_dependencies` and `question_options` are arrays; will be `[]` if empty, never null.

### 9. Frontend Implementation Logic
*   **Caching**: Cache for **1 hour**. This data rarely changes.
*   **Edge Cases**: If `questions` is `[]`, show "Maintenance" screen.

---

## POST | /questionnaire/answers | SUBMIT_ANSWERS

### 1. Context
Persists user responses. Uses `upsert` logic (Insert or Update on conflict).

### 5. The Request Contract
*   **Request Body**:
```json
{
  "answers": [
    {
      "question_id": "uuid (Required)",
      "selected_option_id": "uuid (Optional)",
      "text_value": "string (Optional)"
    }
  ]
}
```

### 10. cURL Snippet
```bash
curl --location --request POST 'http://localhost:3000/api/v1/questionnaire/answers' \
--header 'Authorization: Bearer {{ACCESS_TOKEN}}' \
--header 'Content-Type: application/json' \
--data-raw '{ "answers": [{ "question_id": "uuid", "selected_option_id": "uuid" }] }'
```
