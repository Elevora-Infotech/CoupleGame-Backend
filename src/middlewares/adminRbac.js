'use strict';

const { hasPermission, ACTION_CATEGORIES } = require('../constants/adminPermissions');

/**
 * Middleware: requireCategory
 * Checks whether the authenticated admin's role has permission for the specified category.
 * Rejects with 403 Forbidden if unauthorized.
 * 
 * @param {string} category - One of ACTION_CATEGORIES
 */
const requireCategory = (category) => {
  return (req, res, next) => {
    const admin = req.admin;
    if (!admin) {
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Authentication required. No admin session attached.',
      });
    }

    const role = (admin.role || 'support').toLowerCase();
    if (!hasPermission(role, category)) {
      console.warn(`[RBAC] Access denied for admin ${admin.email} (Role: ${role}) on category: ${category}`);
      return res.status(403).json({
        status: 'error',
        code: 'ROLE_RESTRICTED',
        message: `Access denied. Role '${role}' lacks permission for '${category}'. This action is restricted to Admin.`,
        requiredCategory: category,
        userRole: role,
      });
    }

    next();
  };
};

/**
 * Middleware: requireAdminOnly
 * Shortcut for actions strictly restricted to Admin (super_admin / admin)
 */
const requireAdminOnly = (req, res, next) => {
  const admin = req.admin;
  if (!admin) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  }

  const role = (admin.role || 'support').toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      code: 'ADMIN_ONLY',
      message: `Access denied. Role '${role}' is not authorized to perform this operation. Superuser Admin privileges required.`,
    });
  }

  next();
};

module.exports = {
  requireCategory,
  requireAdminOnly,
  ACTION_CATEGORIES,
};
