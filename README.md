# EleVora Couple Game - Backend

EleVora is an industry-standard backend for a couples card game, featuring secure authentication, real-time game state management, and robust security protocols.

## 🚀 Key Features

- **Advanced Authentication:** Seamless Signup and Login with Email/Password and Google OAuth integration.
- **Dual-Token System:** High-security JWT implementation using short-lived Access Tokens (15m) and long-lived Refresh Tokens (7d) with automatic rotation.
- **OTP Password Recovery:** Secure 6-digit OTP-based password reset flow with automated Gmail SMTP integration.
- **Security Hardened:** 
  - **Rate Limiting:** Protects against DoS and automated attacks.
  - **Brute-Force Protection:** Automated account lockout after 5 failed OTP verification attempts.
  - **Security Headers:** Integrated with `helmet` for HTTP security.
- **Database:** Fully integrated with **Supabase (PostgreSQL)**.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **Auth:** JWT (jsonwebtoken), Google Auth Library, bcryptjs
- **Security:** express-rate-limit, helmet, zod (Validation)
- **Mailing:** Nodemailer

## 🔧 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Elevora-Infotech/CoupleGame-Backend.git
   cd CoupleGame-Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following:
   ```env
   PORT=3000
   NODE_ENV=development
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   getClient_URL=http://localhost:5173
   GOOGLE_CLIENT_ID=your_google_id
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_google_app_password
   JWT_ACCESS_SECRET=your_secret
   JWT_REFRESH_SECRET=your_secret
   ```

4. **Run the server:**
   ```bash
   npm run dev
   ```

## 📖 Documentation

For detailed API documentation, request/response examples, and frontend integration guides, please refer to:
👉 [**Frontend Integration & API Guide**](./docs/auth_doc.md)

## 🧪 Testing

Run the automated test suite to verify system integrity:
```bash
npm test
```

---
*Built with ❤️ by Elevora Infotech*
