const nodemailer = require('nodemailer');
const { env } = require('../config/env');

// Configure standard SMTP transport (Local NodeMailer, AWS SES, Resend, etc.)
const isGmail = env.SMTP_HOST === 'smtp.gmail.com';
const transporter = nodemailer.createTransport(
  isGmail
    ? {
        service: 'gmail',
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      }
    : {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT, // 587 or 465
        secure: env.SMTP_PORT === 465, 
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      }
);

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
    from: `"SoulShuffle Support" <${env.SMTP_FROM || env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Your SoulShuffle Password Reset Code',
    text: `Your SoulShuffle password reset code is: ${otp}. This code is valid for 1 hour.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #fce7f3; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #FF296D; margin-top: 0;">SoulShuffle Password Reset</h2>
        <p style="color: #475569; font-size: 14px;">Someone requested a password reset for your SoulShuffle account. Your 6-digit recovery OTP code is:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 900; color: #FF296D; background-color: #fff1f2; padding: 12px 24px; border-radius: 12px; border: 1px dashed #f43f5e;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 12px;">This code will expire in exactly 1 hour. If you did not request this reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">© SoulShuffle • Keep the spark alive</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Automatically dispatched OTP to ${toEmail}`);
  } catch (error) {
    console.error('❌ Error dispatching email:', error.message || error);
    console.log(`\n==========================================`);
    console.log(`🚨 RECOVERY OTP CODE FOR ${toEmail}: ${otp}`);
    console.log(`==========================================\n`);
    throw new Error('Our mailing server failed to dispatch the OTP. Please check your SMTP credentials.');
  }
};

module.exports = { sendResetOtpEmail };
