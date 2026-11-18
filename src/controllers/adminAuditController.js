'use strict';

const adminAuditService = require('../services/adminAuditService');

/**
 * Controller: Get paginated action logs
 * Route: GET /api/v1/admin/audit-logs
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const result = await adminAuditService.getAuditLogs(req.query);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
};
