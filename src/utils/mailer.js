const nodemailer = require('nodemailer');
const { env } = require('../config/env');

// Configure standard SMTP transport (Local NodeMailer, AWS SES, Resend, etc.)
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT, // 587 or 465
  secure: env.SMTP_PORT === 465, 
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

/**
 * Sends a 6-digit OTP code to the requested email.
 */
const sendResetOtpEmail = async (toEmail, otp) => {
  // If SMTP isn't configured for production yet, fallback to local console
  if (!env.SMTP_HOST || env.SMTP_HOST === 'smtp.example.com') {
    console.log(`\n==========================================`);
    console.log(`🚨 DEVELOPMENT MODE: SMTP NOT YET CONFIGURED.`);
    console.log(`📧 TO: ${toEmail}`);
    console.log(`🔑 SECURE OTP: ${otp}`);
    console.log(`==========================================\n`);
    return;
  }

  const mailOptions = {
    from: env.SMTP_FROM,
    to: toEmail,
    subject: 'Your EleVora Password Reset Code',
    text: `Your password reset code is: ${otp}. This code is valid for 1 hour.`,
    html: `
      <h2>Password Reset Request</h2>
      <p>Someone requested a password reset for your EleVora account. Your 6-digit OTP code is:</p>
      <h1 style="letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
      <p>This code will expire in exactly 1 hour. If you did not request this, please safely ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Automatically dispatched OTP to ${toEmail}`);
  } catch (error) {
    console.error('❌ Error dispatching email:', error);
    throw new Error('Our mailing server failed to dispatch the OTP. Please try again later.');
  }
};

module.exports = { sendResetOtpEmail };
