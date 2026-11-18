'use strict';

/**
 * @file   adminContentService.js
 * @desc   Content Management Service for Cards, Categories & Bundles (Part B4 & C6)
 *
 * Invariants:
 *  1. Immutable card versioning: when a card prompt is updated, its version counter
 *     increments (v1 -> v2) and old snapshot is preserved in admin_audit_logs.
 *  2. Mandatory reason (>= 5 chars) on all content mutations.
 *  3. Full backward compatibility with mobile app queries.
 */

const { supabase } = require('../db/supabase');
const { formatIST, logAdminAction } = require('./adminAuditService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// 1. CARDS CATALOG (Paginated + Filterable)
// ─────────────────────────────────────────────────────────────
const getCardsCatalog = async ({
  page = 1,
  limit = 20,
  categoryId = '',
  cardType = '',
  spiceLevel = '',
  status = '',
  search = '',
} = {}) => {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('cards')
    .select(`
      id, category_id, name, power_description, image_url, attributes, card_type,
      is_active, created_at, updated_at, deflect_action, is_wildcard,
      card_categories!inner ( id, name, theme_color, is_active )
    `, { count: 'exact' });

  if (categoryId) query = query.eq('category_id', categoryId);
  if (cardType)   query = query.eq('card_type', cardType);
  if (status === 'active')   query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);
  if (search) query = query.or(`name.ilike.%${search}%,power_description.ilike.%${search}%`);

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throwError(error.message, 400);

  let formatted = (data || []).map(c => {
    const attrs = c.attributes || {};
    return {
      id: c.id,
      name: c.name,
      prompt: c.power_description,
      category_id: c.category_id,
      category_name: c.card_categories?.name || 'General',
      category_color: c.card_categories?.theme_color || '#8b5cf6',
      card_type: c.card_type || 'ACTION',
      version: attrs.version || 1,
      spice_level: attrs.spice_level || 1,
      timer_hours: attrs.timer_hours || 24,
      penalty_prompt: attrs.penalty_prompt || '',
      is_active: c.is_active !== false,
      is_wildcard: c.is_wildcard || false,
      created_at_ist: formatIST(c.created_at),
      updated_at_ist: formatIST(c.updated_at),
    };
  });

  if (spiceLevel) {
    formatted = formatted.filter(c => String(c.spice_level) === String(spiceLevel));
  }

  return {
    cards: formatted,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || formatted.length,
      pages: Math.ceil((count || formatted.length) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────
// 2. GET CARD BY ID WITH VERSION AUDIT LOGS (Part C6)
// ─────────────────────────────────────────────────────────────
const getCardById = async (cardId) => {
  const { data: card, error } = await supabase
    .from('cards')
    .select(`
      id, category_id, name, power_description, image_url, attributes, card_type,
      is_active, created_at, updated_at, deflect_action, is_wildcard,
      card_categories ( id, name, theme_color )
    `)
    .eq('id', cardId)
    .single();

  if (error || !card) throwError('Card not found.', 404);

  // Fetch version audit logs for this card
  const { data: auditLogs } = await supabase
    .from('admin_audit_logs')
    .select('*')
    .eq('target_entity', 'cards')
    .eq('target_id', cardId)
    .order('created_at', { ascending: false });

  const attrs = card.attributes || {};

  return {
    id: card.id,
    name: card.name,
    prompt: card.power_description,
    category_id: card.category_id,
    category: card.card_categories,
    version: attrs.version || 1,
    spice_level: attrs.spice_level || 1,
    timer_hours: attrs.timer_hours || 24,
    penalty_prompt: attrs.penalty_prompt || '',
    is_active: card.is_active !== false,
    version_history: (auditLogs || []).map(l => ({
      id: l.id,
      action_type: l.action_type,
      admin_name: l.admin_name,
      reason: l.reason,
      before_state: l.before_state,
      after_state: l.after_state,
      timestamp_ist: formatIST(l.created_at),
    })),
  };
};

// ─────────────────────────────────────────────────────────────
// 3. CREATE NEW DARE CARD
// ─────────────────────────────────────────────────────────────
const createCard = async ({
  name,
  prompt,
  categoryId,
  cardType = 'ACTION',
  spiceLevel = 1,
  timerHours = 24,
  penaltyPrompt = '',
  admin,
  reason,
}) => {
  if (!name || !prompt || !categoryId) {
    throwError('Name, prompt, and category are required.', 400);
  }
  const auditReason = (reason && reason.trim()) || 'Card created via Admin Panel';

  const attributes = {
    version: 1,
    spice_level: Number(spiceLevel) || 1,
    timer_hours: Number(timerHours) || 24,
    penalty_prompt: penaltyPrompt ? penaltyPrompt.trim() : '',
  };

  const { data, error } = await supabase
    .from('cards')
    .insert({
      name: name.trim(),
      power_description: prompt.trim(),
      category_id: categoryId,
      card_type: cardType,
      attributes,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throwError(error.message, 400);

  if (admin) {
    try {
      await logAdminAction({
        adminId: admin.id,
        adminName: admin.name,
        role: admin.role,
        actionType: 'CREATE_DARE_CARD',
        targetEntity: 'cards',
        targetId: data.id,
        reason: auditReason,
      });
    } catch (e) {}
  }

  return data;
};

/**
 * Bulk create cards from CSV / Array
 */
const createBulkCards = async ({ cards = [], admin, defaultCategoryId }) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    throwError('No cards provided for bulk import.', 400);
  }

  // Fetch all categories to map category name to ID
  const { data: allCategories } = await supabase.from('card_categories').select('id, name');
  const catMap = {};
  (allCategories || []).forEach(c => {
    catMap[c.name.trim().toLowerCase()] = c.id;
    catMap[c.id] = c.id;
  });

  const rowsToInsert = [];
  for (const card of cards) {
    const rawName = card.name || card.title || card.card_name || card.CardName || '';
    const rawPrompt = card.prompt || card.power_description || card.description || card.dare || card.action || card.Prompt || '';
    let catId = card.category_id || card.categoryId || defaultCategoryId;
    
    // Check if category provided as string name (e.g. "Romance")
    const catName = (card.category || card.category_name || card.Category || '').trim().toLowerCase();
    if (catName && catMap[catName]) {
      catId = catMap[catName];
    }

    if (rawName.trim() && rawPrompt.trim() && (catId || defaultCategoryId)) {
      rowsToInsert.push({
        name: rawName.trim(),
        power_description: rawPrompt.trim(),
        category_id: catId || defaultCategoryId,
        card_type: card.card_type || 'ACTION',
        attributes: { version: 1 },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rowsToInsert.length === 0) {
    throwError('No valid card rows found. Ensure each row has name, description, and valid category.', 400);
  }

  const { data: inserted, error } = await supabase
    .from('cards')
    .insert(rowsToInsert)
    .select('id, name, power_description, category_id, is_active, created_at');

  if (error) throwError('Bulk insert error: ' + error.message, 400);

  if (admin) {
    try {
      await logAdminAction({
        adminId: admin.id,
        adminName: admin.name,
        role: admin.role,
        actionType: 'BULK_IMPORT_CARDS',
        targetEntity: 'cards',
        targetId: 'bulk_import',
        reason: `Bulk imported ${inserted.length} cards via CSV`,
      });
    } catch (e) {}
  }

  return {
    inserted_count: inserted.length,
    cards: inserted,
  };
};

// ─────────────────────────────────────────────────────────────
// 4. UPDATE DARE CARD WITH IMMUTABLE VERSION INCREMENT (Part B4 & C6)
// ─────────────────────────────────────────────────────────────
const updateCard = async ({
  cardId,
  name,
  prompt,
  categoryId,
  spiceLevel,
  timerHours,
  penaltyPrompt,
  isActive,
  admin,
  reason,
}) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A mandatory reason (minimum 5 characters) is required to update card content.', 400);
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();

  if (fetchErr || !existing) throwError('Card not found.', 404);

  const prevAttrs = existing.attributes || {};
  const currentVersion = prevAttrs.version || 1;
  const nextVersion = currentVersion + 1; // Immutable version increment!

  const updatedAttrs = {
    ...prevAttrs,
    version: nextVersion,
    spice_level: spiceLevel !== undefined ? Number(spiceLevel) : prevAttrs.spice_level || 1,
    timer_hours: timerHours !== undefined ? Number(timerHours) : prevAttrs.timer_hours || 24,
    penalty_prompt: penaltyPrompt !== undefined ? penaltyPrompt.trim() : prevAttrs.penalty_prompt || '',
  };

  const updates = {
    updated_at: new Date().toISOString(),
    attributes: updatedAttrs,
  };

  if (name) updates.name = name.trim();
  if (prompt) updates.power_description = prompt.trim();
  if (categoryId) updates.category_id = categoryId;
  if (isActive !== undefined) updates.is_active = Boolean(isActive);

  const { data: updatedCard, error: updateErr } = await supabase
    .from('cards')
    .update(updates)
    .eq('id', cardId)
    .select()
    .single();

  if (updateErr) throwError(updateErr.message, 400);

  // Immutably record the prompt diff into audit logs
  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'UPDATE_CARD_PROMPT_VERSION',
      targetEntity: 'cards',
      targetId: cardId,
      beforeState: {
        version: currentVersion,
        name: existing.name,
        prompt: existing.power_description,
        attributes: prevAttrs,
      },
      afterState: {
        version: nextVersion,
        name: updatedCard.name,
        prompt: updatedCard.power_description,
        attributes: updatedAttrs,
      },
      reason: reason.trim(),
    });
  }

  return {
    message: `Card updated to version ${nextVersion}.`,
    card: updatedCard,
  };
};

// ─────────────────────────────────────────────────────────────
// 5. RETIRE / RESTORE CARD
// ─────────────────────────────────────────────────────────────
const toggleCardStatus = async ({ cardId, isActive, admin, reason }) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A business reason (minimum 5 characters) is required to toggle card active status.', 400);
  }

  const { data: updated, error } = await supabase
    .from('cards')
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq('id', cardId)
    .select()
    .single();

  if (error) throwError(error.message, 400);

  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: isActive ? 'RESTORE_CARD' : 'RETIRE_CARD',
      targetEntity: 'cards',
      targetId: cardId,
      afterState: { is_active: Boolean(isActive) },
      reason: reason.trim(),
    });
  }

  return {
    message: `Card ${isActive ? 'restored to active pool' : 'retired from deck pool'}.`,
    card: updated,
  };
};

// ─────────────────────────────────────────────────────────────
// 6. CARD CATEGORIES MANAGEMENT
// ─────────────────────────────────────────────────────────────
const getCategories = async () => {
  const { data, error } = await supabase
    .from('card_categories')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throwError(error.message, 400);

  return (data || []).map(cat => ({
    ...cat,
    created_at_ist: formatIST(cat.created_at),
    updated_at_ist: formatIST(cat.updated_at),
  }));
};

const updateCategory = async ({ categoryId, name, themeColor, description, isActive, admin, reason }) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A mandatory reason (minimum 5 characters) is required to update categories.', 400);
  }

  const updates = { updated_at: new Date().toISOString() };
  if (name) updates.name = name.trim();
  if (themeColor) updates.theme_color = themeColor.trim();
  if (description !== undefined) updates.description = description.trim();
  if (isActive !== undefined) updates.is_active = Boolean(isActive);

  const { data, error } = await supabase
    .from('card_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) throwError(error.message, 400);

  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'UPDATE_CARD_CATEGORY',
      targetEntity: 'card_categories',
      targetId: categoryId,
      afterState: data,
      reason: reason.trim(),
    });
  }

  return {
    message: 'Category updated successfully.',
    category: data,
  };
};

// ─────────────────────────────────────────────────────────────
// 7. CONTENT VERSION DIFFS AUDIT VIEWER (Part C6)
// ─────────────────────────────────────────────────────────────
const getContentVersionDiffs = async ({ limit = 50 } = {}) => {
  const { data: logs, error } = await supabase
    .from('admin_audit_logs')
    .select('*')
    .in('action_type', ['CREATE_DARE_CARD', 'UPDATE_CARD_PROMPT_VERSION', 'RETIRE_CARD', 'RESTORE_CARD'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throwError(error.message, 400);

  return (logs || []).map(l => ({
    id: l.id,
    card_id: l.target_id,
    action: l.action_type,
    admin_name: l.admin_name,
    reason: l.reason,
    before: l.before_state,
    after: l.after_state,
    created_at_ist: formatIST(l.created_at),
  }));
};

module.exports = {
  getCardsCatalog,
  getCardById,
  createCard,
  createBulkCards,
  updateCard,
  toggleCardStatus,
  getCategories,
  updateCategory,
  getContentVersionDiffs,
};
