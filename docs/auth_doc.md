# EleVora Backend: Authentication System (Frontend Guide)

This document provides a detailed walkthrough for the Frontend Developer on how to integrate the Authentication, Login, Signup, and Password Reset systems for the EleVora application.

---

## 🔐 1. Base URL
All authentication endpoints are prefixed with:
`http://localhost:3000/api/v1/auth`

---

## 🛠️ 2. Core Endpoints

### `POST /auth/signup`
- **Payload:** `{ "name": "User Name", "email": "user@example.com", "password": "securePass123" }`
- **Returns:** User object + `accessToken` + `refreshToken`.
- **Note:** Redirect to Home screen upon success.

### `POST /auth/login`
- **Payload:** `{ "email": "user@example.com", "password": "securePass123" }`
- **Returns:** User object + `accessToken` + `refreshToken`.

### `POST /auth/google`
- **Payload:** `{ "token": "google_id_token_from_client" }`
- **Returns:** User object + `accessToken` + `refreshToken`.
- **Note:** If the user already has an email account, it automatically links them.

### `POST /auth/refresh-token`
- **Payload:** `{ "refreshToken": "stored_refresh_token" }`
- **Returns:** New `accessToken` + New `refreshToken`.
- **Note:** Use this for **Silent Login** (Token Rotation).

### `POST /auth/forgot-password`
- **Payload:** `{ "email": "user@example.com" }`
- **Returns:** SUCCESS message even if email doesn't exist (Security fix).
- **Behavior:** Generates 6-digit OTP and sends it via Gmail.

### `POST /auth/verify-otp`
- **Payload:** `{ "email": "user@example.com", "otp": "123456" }`
- **Returns:** SUCCESS message.
- **Security Note:** If a user fails to verify their OTP **5 times**, the system will lock the code for 15 minutes. The API will return `429 Too Many Requests` in this case.

### `POST /auth/reset-password`
- **Payload:** `{ "email": "user@example.com", "otp": "123456", "newPassword": "NewPassword123" }`
- **Returns:** SUCCESS message.

---

## 🔒 Security & Rate Limiting

To protect the server, the following **Rate Limits** are enforced:
1.  **Global Limit:** 100 requests every 15 minutes per IP.
2.  **Auth-Specific Limit:** 20 requests every 15 minutes for sensitive routes like Login, Signup, and OTP requests.

If the frontend hits these limits, the backend will return:
- **Status Code:** `429 Too Many Requests`
- **Payload:** `{ "status": "error", "message": "Too many attempts..." }`

---

## 🛡️ 3. Token Storage Strategy

You will receive two tokens upon a successful login/signup:
- **`accessToken`**: Lasts 15 minutes. Store this in your **JS Memory** (not LocalStorage) for security.
- **`refreshToken`**: Lasts 7 days. Store this in a **Secure HttpOnly Cookie** or a secure persistent storage on the device.

---

## 🔄 4. The Axios Interceptor Flow (Crucial!)

To keep the user logged in forever, your mobile/web app should use an **Axios Interceptor**. This automatically catches "Token Expired" errors and refreshes the login in the background.

### **The Logic:**
1.  **API Call:** Frontend sends a request with `Bearer accessToken`.
2.  **Expired:** Backend returns `401 Unauthorized` (Token expired).
3.  **Intercept:** The Axios Interceptor catches the 401 error.
4.  **Refresh:** Frontend calls `/auth/refresh-token` with the stored `refreshToken`.
5.  **Success:** Backend gives a new `accessToken`.
6.  **Retry:** Frontend automatically retries the original failed API call with the **new** token.

---

## ⚠️ Error Responses
All errors follow this JSON structure:
```json
{
  "status": "error",
  "message": "Human readable error message",
  "errors": [] // Optional: validation details
}
```
