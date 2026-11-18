'use strict';

/**
 * Privacy & Data Masking Utilities
 * Requirements Part B1:
 * - "Phone numbers masked everywhere. Example: 98•••••210"
 * - "Email shown only on player screen."
 * - "Card notes partners write to each other are never shown in the panel."
 */

/**
 * Mask a phone number to standard format: 98•••••210
 * Retains the first 2 digits and last 3 digits, masking middle digits.
 * @param {string|null} phone 
 * @returns {string|null}
 */
const maskPhoneNumber = (phone) => {
  if (!phone) return null;
  const str = String(phone).trim();
  if (str.length < 5) return '•••••';

  // Handle optional leading '+' or country codes
  if (str.startsWith('+91')) {
    const raw = str.slice(3).replace(/\D/g, '');
    if (raw.length >= 5) {
      return `+91 ${raw.slice(0, 2)}•••••${raw.slice(-3)}`;
    }
  }

  const digitsOnly = str.replace(/\D/g, '');
  if (digitsOnly.length >= 5) {
    const start = digitsOnly.slice(0, 2);
    const end = digitsOnly.slice(-3);
    return `${start}•••••${end}`;
  }

  return '••••••••';
};

/**
 * Mask email for bulk tables: priya.k92@gmail.com -> p•••••92@gmail.com
 * @param {string|null} email 
 * @returns {string|null}
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const atIdx = email.indexOf('@');
  if (atIdx === -1) return '••••@••••';

  const user = email.slice(0, atIdx);
  const domain = email.slice(atIdx);

  if (user.length <= 2) {
    return `${user[0] || '•'}•••${domain}`;
  }

  const start = user.slice(0, 1);
  const end = user.slice(-2);
  return `${start}•••••${end}${domain}`;
};

/**
 * Sanitize user object for bulk list endpoints (masked phone + masked email)
 * @param {object} user 
 * @returns {object}
 */
const sanitizeUserForList = (user) => {
  if (!user || typeof user !== 'object') return user;
  const copy = { ...user };
  if (copy.phone) {
    copy.phone_masked = maskPhoneNumber(copy.phone);
    copy.phone = copy.phone_masked; // Never leak raw phone
  }
  if (copy.email) {
    copy.email = maskEmail(copy.email);
  }
  return copy;
};

/**
 * Sanitize user object for Single Player Screen (masked phone + FULL raw email)
 * As per spec: "Email shown only on player screen."
 * @param {object} user 
 * @returns {object}
 */
const sanitizeUserForDetail = (user) => {
  if (!user || typeof user !== 'object') return user;
  const copy = { ...user };
  if (copy.phone) {
    copy.phone_masked = maskPhoneNumber(copy.phone);
    copy.phone = copy.phone_masked; // Masked phone everywhere
  }
  // copy.email is kept in full for individual support screen
  return copy;
};

/**
 * Strictly strip partner dare notes from card send records
 * Only retains optional_note_used boolean (never the private text)
 * @param {object} cardSend 
 * @returns {object}
 */
const stripPrivateCardNotes = (cardSend) => {
  if (!cardSend || typeof cardSend !== 'object') return cardSend;
  const copy = { ...cardSend };

  // Calculate boolean flag if not already populated
  const hasNote = Boolean(
    (copy.message && copy.message.trim().length > 0) ||
    (copy.private_note && copy.private_note.trim().length > 0) ||
    (copy.note && copy.note.trim().length > 0) ||
    copy.optional_note_used === true
  );

  copy.optional_note_used = hasNote;

  // Delete all private text fields
  delete copy.message;
  delete copy.private_note;
  delete copy.note;
  delete copy.sender_note;
  delete copy.custom_prompt;

  return copy;
};

module.exports = {
  maskPhoneNumber,
  maskEmail,
  sanitizeUserForList,
  sanitizeUserForDetail,
  stripPrivateCardNotes,
};
