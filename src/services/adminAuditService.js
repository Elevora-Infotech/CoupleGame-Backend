'use strict';

const { supabase } = require('../db/supabase');

/**
 * Format a UTC date string into Indian Standard Time (IST) display format
 * Example: "12 Nov 2026, 4:02 PM"
 * @param {string|Date} dateStr 
 * @returns {string}
 */
const formatIST = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch (err) {
    return String(dateStr);
  }
};

/**
 * Log an administrative action to admin_audit_logs
 * Mandates a business reason for every mutating operation.
 * 
 * @param {object} params
 * @param {string} params.adminId - UUID of the acting admin
 * @param {string} params.adminName - Name of the admin
 * @param {string} params.role - Role (admin / super_admin / support)
 * @param {string} params.actionType - Action name (e.g. 'REFUND_DUPLICATE', 'FORCE_END_GAME')
 * @param {string} params.targetEntity - Entity type ('couple', 'game', 'player', 'purchase', 'card', 'system')
 * @param {string} params.targetId - Identifier of target (e.g. room code or UUID)
 * @param {object|null} params.beforeState - State prior to action
 * @param {object|null} params.afterState - State resulting from action
 * @param {string} params.reason - Mandatory explanation (min 5 chars)
 */
const logAdminAction = async ({
  adminId,
  adminName,
  role,
  actionType,
  targetEntity,
  targetId,
  beforeState = null,
  afterState = null,
  reason,
}) => {
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    const err = new Error('A specific business reason (minimum 5 characters) is mandatory for this admin action.');
    err.status = 400;
    err.code = 'MANDATORY_REASON_REQUIRED';
    throw err;
  }

  const payload = {
    admin_id: adminId || '00000000-0000-0000-0000-000000000000',
    admin_name: adminName || 'System Admin',
    role: role || 'admin',
    action_type: actionType,
    target_entity: targetEntity,
    target_id: String(targetId || 'unknown'),
    before_state: beforeState,
    after_state: afterState,
    reason: reason.trim(),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('admin_audit_logs')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[AdminAuditService] Error inserting audit log:', error.message);
    throw error;
  }

  return data;
};

/**
 * Query audit logs with pagination, search, and IST formatting
 * 
 * @param {object} query
 * @param {number} [query.page=1]
 * @param {number} [query.limit=20]
 * @param {string} [query.actionType]
 * @param {string} [query.targetEntity]
 * @param {string} [query.targetId]
 * @param {string} [query.adminId]
 * @param {string} [query.search]
 * @param {string} [query.dateFrom]
 * @param {string} [query.dateTo]
 */
const getAuditLogs = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let dbQuery = supabase
    .from('admin_audit_logs')
    .select('*', { count: 'exact' });

  if (query.actionType) {
    dbQuery = dbQuery.eq('action_type', query.actionType);
  }
  if (query.targetEntity) {
    dbQuery = dbQuery.eq('target_entity', query.targetEntity);
  }
  if (query.targetId) {
    dbQuery = dbQuery.ilike('target_id', `%${query.targetId}%`);
  }
  if (query.adminId) {
    dbQuery = dbQuery.eq('admin_id', query.adminId);
  }
  if (query.search) {
    dbQuery = dbQuery.or(
      `admin_name.ilike.%${query.search}%,reason.ilike.%${query.search}%,target_id.ilike.%${query.search}%,action_type.ilike.%${query.search}%`
    );
  }
  if (query.dateFrom) {
    dbQuery = dbQuery.gte('created_at', query.dateFrom);
  }
  if (query.dateTo) {
    dbQuery = dbQuery.lte('created_at', query.dateTo);
  }

  dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await dbQuery;

  if (error) {
    console.error('[AdminAuditService] Error fetching audit logs:', error.message);
    throw error;
  }

  // Format timestamps to IST for display
  const formattedLogs = (data || []).map((log) => ({
    ...log,
    created_at_utc: log.created_at,
    created_at_ist: formatIST(log.created_at),
  }));

  return {
    logs: formattedLogs,
    pagination: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
};

module.exports = {
  logAdminAction,
  getAuditLogs,
  formatIST,
};
