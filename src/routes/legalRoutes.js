const express = require('express');
const router = express.Router();

const privacyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - SoulShuffle</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #222; max-width: 800px; margin: 0 auto; padding: 30px 20px; background: #fafafa; }
    .card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    h1 { color: #E11D48; margin-top: 0; font-size: 28px; }
    h2 { color: #111; margin-top: 28px; font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    p, li { color: #444; font-size: 15px; }
    .badge { display: inline-block; background: #FFE4E6; color: #E11D48; font-weight: 600; padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-bottom: 15px; }
    .footer { margin-top: 40px; text-align: center; font-size: 13px; color: #888; }
    a { color: #E11D48; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SoulShuffle Legal</div>
    <h1>Privacy Policy</h1>
    <p><strong>Effective Date:</strong> October 2026</p>
    <p>SoulShuffle ("we", "our", or "us") is dedicated to protecting your privacy. This Privacy Policy outlines our practices regarding the collection, use, and disclosure of information when you use our mobile application and related services.</p>

    <h2>1. Information We Collect</h2>
    <ul>
      <li><strong>Account Information:</strong> When you register or sign in using email, Google, or Apple ID, we collect your name, email address, and profile avatar.</li>
      <li><strong>Gameplay & Communication Data:</strong> Private room codes, card selections, dare status, and completion timestamps between paired partners.</li>
      <li><strong>Device & Notification Data:</strong> Device push notification tokens (Expo Push) to notify you of incoming partner turns and game events.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>To authenticate and maintain your secure session.</li>
      <li>To sync live gameplay, cards, and turns between you and your partner.</li>
      <li>To deliver critical push notifications regarding dares, reminders, and streaks.</li>
      <li>To maintain security and prevent abusive or unauthorized activity.</li>
    </ul>

    <h2>3. Data Sharing & Third Parties</h2>
    <p>We do not sell, rent, or trade your personal data. We only utilize trusted infrastructure providers solely for app functionality:</p>
    <ul>
      <li><strong>Database & Hosting:</strong> Supabase and Amazon Web Services (AWS) with encrypted storage.</li>
      <li><strong>Push Notifications:</strong> Expo Push Notification Service.</li>
    </ul>

    <h2>4. Data Retention and Security</h2>
    <p>Your data is transmitted over TLS/SSL encryption. We maintain strict access controls and Row Level Security on all user tables.</p>

    <h2>5. User Rights & Account Deletion</h2>
    <p>You have the right to request deletion of your account and all associated personal data at any time. To request account deletion, visit our <a href="/delete-account">Account Deletion Page</a> or email us at <a href="mailto:sunilbhor1977@gmail.com">sunilbhor1977@gmail.com</a>.</p>

    <h2>6. Contact Us</h2>
    <p>If you have any questions or concerns about this policy, please reach out to us at:<br>
    <strong>Email:</strong> <a href="mailto:sunilbhor1977@gmail.com">sunilbhor1977@gmail.com</a></p>
  </div>
  <div class="footer">&copy; 2026 SoulShuffle. All Rights Reserved.</div>
</body>
</html>`;

const deleteAccountHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account & Data Deletion - SoulShuffle</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #222; max-width: 800px; margin: 0 auto; padding: 30px 20px; background: #fafafa; }
    .card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    h1 { color: #E11D48; margin-top: 0; font-size: 28px; }
    h2 { color: #111; margin-top: 28px; font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    p, li { color: #444; font-size: 15px; }
    .badge { display: inline-block; background: #FFE4E6; color: #E11D48; font-weight: 600; padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-bottom: 15px; }
    .action-box { background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 8px; padding: 20px; margin: 25px 0; }
    .btn { display: inline-block; background: #E11D48; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 15px; margin-top: 10px; }
    .btn:hover { background: #BE123C; }
    .footer { margin-top: 40px; text-align: center; font-size: 13px; color: #888; }
    a { color: #E11D48; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SoulShuffle Account Management</div>
    <h1>Account & Data Deletion Request</h1>
    <p>At SoulShuffle, we respect your right to control your personal data. You can delete your account and associated data directly through the mobile application or by submitting a request below.</p>

    <div class="action-box">
      <h3 style="margin-top:0; color: #9F1239;">Submit a Deletion Request</h3>
      <p style="margin-bottom: 15px;">Send an account deletion request directly to our support team. Please include the email address registered with your SoulShuffle account.</p>
      <a class="btn" href="mailto:sunilbhor1977@gmail.com?subject=SoulShuffle%20Account%20Deletion%20Request&body=Please%20delete%20my%20SoulShuffle%20account%20and%20all%20associated%20data.%0A%0ARegistered%20Email:%20">Request Account Deletion via Email</a>
    </div>

    <h2>What Happens When Your Account is Deleted?</h2>
    <ul>
      <li><strong>Profile & Authentication:</strong> Your name, email, credentials, and profile details are permanently deleted from our servers.</li>
      <li><strong>Gameplay & Couples History:</strong> Active room links, partner pairings, custom card actions, and dare histories are immediately disassociated and purged.</li>
      <li><strong>Notification Tokens:</strong> All device push notification tokens are permanently removed.</li>
    </ul>

    <h2>Data Retention Timeline</h2>
    <p>Account deletion requests submitted via email or within the app are processed within <strong>7 business days</strong>. Once deleted, this action is permanent and cannot be reversed.</p>

    <h2>Need Help?</h2>
    <p>If you have any questions about data retention or account deletion, please contact our support team at <a href="mailto:sunilbhor1977@gmail.com">sunilbhor1977@gmail.com</a>.</p>
  </div>
  <div class="footer">&copy; 2026 SoulShuffle. All Rights Reserved.</div>
</body>
</html>`;

router.get(['/', '/privacy', '/api/v1/privacy'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(privacyHtml);
});

router.get(['/delete-account', '/api/v1/delete-account', '/account-deletion'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(deleteAccountHtml);
});

module.exports = router;
