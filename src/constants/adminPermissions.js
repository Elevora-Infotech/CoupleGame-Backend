'use strict';

/**
 * Action Categories for Admin & Support RBAC
 * Requirement Part B1:
 * "Admin can do everything. Support can view couples and players, add support notes,
 * do support actions — but cannot issue refunds, change money settings, edit cards
 * or game settings, or force-end games. Every action has a category so new roles
 * can be added later."
 */
const ACTION_CATEGORIES = Object.freeze({
  READ_OPERATIONS: 'READ_OPERATIONS',           // View couples, players, stats, games
  SEARCH: 'SEARCH',                             // Global unified search
  SUPPORT_NOTES: 'SUPPORT_NOTES',               // Read/write couple support notes
  SUPPORT_ACTIONS: 'SUPPORT_ACTIONS',           // Resend invite, close stuck room, restore card, extend timer
  FINANCIAL_OPERATIONS: 'FINANCIAL_OPERATIONS', // Issue refunds, financial summaries
  SYSTEM_CONTROLS: 'SYSTEM_CONTROLS',           // Force-end game, pause all timers, maintenance banner
  CONTENT_MANAGEMENT: 'CONTENT_MANAGEMENT',     // Edit/retire cards, categories, bundles
  SETTINGS_MANAGEMENT: 'SETTINGS_MANAGEMENT',   // Edit game settings, dynamic timers, fee %s
  AUDIT_LOGS_VIEW: 'AUDIT_LOGS_VIEW',           // View immutable audit logs
});

/**
 * Role to Action Category mappings
 */
const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.values(ACTION_CATEGORIES),
  super_admin: Object.values(ACTION_CATEGORIES),
  support: [
    ACTION_CATEGORIES.READ_OPERATIONS,
    ACTION_CATEGORIES.SEARCH,
    ACTION_CATEGORIES.SUPPORT_NOTES,
    ACTION_CATEGORIES.SUPPORT_ACTIONS,
    ACTION_CATEGORIES.AUDIT_LOGS_VIEW,
  ],
});

/**
 * Helper to check if a role has a given permission category
 * @param {string} role 
 * @param {string} category 
 * @returns {boolean}
 */
const hasPermission = (role, category) => {
  if (!role || !category) return false;
  const normalizedRole = String(role).toLowerCase();
  const permissions = ROLE_PERMISSIONS[normalizedRole] || [];
  return permissions.includes(category);
};

/**
 * Get all permitted categories for a role
 * @param {string} role 
 * @returns {string[]}
 */
const getAllowedCategories = (role) => {
  if (!role) return [];
  const normalizedRole = String(role).toLowerCase();
  return ROLE_PERMISSIONS[normalizedRole] || [];
};

module.exports = {
  ACTION_CATEGORIES,
  ROLE_PERMISSIONS,
  hasPermission,
  getAllowedCategories,
};
