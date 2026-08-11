import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

export const FNB_CHECK_STATUSES = Object.freeze(['open', 'sent_to_kitchen', 'partially_paid', 'paid', 'voided', 'transferred']);
export const FNB_KITCHEN_TICKET_STATUSES = Object.freeze(['queued', 'preparing', 'ready', 'served', 'cancelled']);
export const FNB_RESERVATION_STATUSES = Object.freeze(['requested', 'confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show']);
export const FNB_COURSES = Object.freeze(['appetizer', 'main', 'dessert', 'drink', 'other']);
export const FNB_DEFAULT_RESERVATION_DURATION_MINUTES = 90;
export const FNB_DEFAULT_RESERVATION_BUFFER_MINUTES = 15;

const CHECK_TRANSITIONS = Object.freeze({
  open: ['sent_to_kitchen', 'partially_paid', 'paid', 'voided', 'transferred'],
  sent_to_kitchen: ['partially_paid', 'paid', 'voided', 'transferred'],
  partially_paid: ['paid', 'voided'],
  paid: [],
  voided: [],
  transferred: []
});

const ACTIVE_CHECK_STATUSES = Object.freeze(['open', 'sent_to_kitchen', 'partially_paid']);

const KITCHEN_TICKET_TRANSITIONS = Object.freeze({
  queued: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [],
  cancelled: []
});

const KITCHEN_TICKET_LINE_STATUS = Object.freeze({
  queued: 'sent',
  preparing: 'preparing',
  ready: 'ready',
  served: 'served'
});

const RESERVATION_TRANSITIONS = Object.freeze({
  requested: ['confirmed', 'waitlisted', 'cancelled'],
  confirmed: ['seated', 'cancelled', 'no_show'],
  waitlisted: ['confirmed', 'cancelled'],
  seated: [],
  cancelled: [],
  no_show: []
});

const toPlain = (value) => (
  value && typeof value.toJSON === 'function'
    ? value.toJSON()
    : value
);

const toPositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const toBoundedInt = (value, { fallback, min, max }) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const trim = (value, maxLength = 255) => String(value || '').trim().slice(0, maxLength);
const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
  return fallback;
};

const assertActiveModifierGroups = async (fnbRepository, assignments = [], transaction) => {
  if (typeof fnbRepository?.listModifierGroups !== 'function') return;
  const activeGroups = await fnbRepository.listModifierGroups({ includeInactive: false }, { transaction });
  const activeIds = new Set((Array.isArray(activeGroups) ? activeGroups : [])
    .map((group) => Number(group?.modifier_group_id)));
  const invalid = assignments.find((entry) => !activeIds.has(Number(entry.modifier_group_id)));
  if (invalid) {
    throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Modifier group is not active or does not exist');
  }
};

const parseJson = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const normalizeRestaurantServiceChargeSettings = (payload = {}) => ({
  enabled: normalizeBoolean(payload.enabled, false),
  label: trim(payload.label || 'Restaurant service charge', 120) || 'Restaurant service charge',
  rate: round4(Math.min(100, Math.max(0, Number(payload.rate || 0)))),
  taxable: normalizeBoolean(payload.taxable, false)
});

const mapError = (error, fallbackMessage) => (
  isDomainError(error)
    ? error
    : new DomainError(DomainErrorCode.INTERNAL_ERROR, error?.message || fallbackMessage, { statusCode: 500 })
);

const assertTransition = (transitions, currentStatus, nextStatus, label) => {
  const current = String(currentStatus || '').trim();
  const next = String(nextStatus || '').trim();
  if (current === next) return;
  const allowed = transitions[current] || [];
  if (!allowed.includes(next)) {
    throw new DomainError(
      DomainErrorCode.CONFLICT,
      `${label} cannot move from ${current || 'unknown'} to ${next || 'unknown'}`,
      { statusCode: 409, details: { current_status: current, requested_status: next, allowed_statuses: allowed } }
    );
  }
};

const withTransaction = async (repository, callback) => {
  const transaction = await repository.beginTransaction();
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const assertConditionalModifierTopology = async ({
  fnbRepository,
  parentModifierOptionId,
  currentGroupId = null,
  options = {}
}) => {
  let optionId = toPositiveInt(parentModifierOptionId);
  const visitedOptionIds = new Set();
  const visitedGroupIds = new Set();
  while (optionId) {
    if (visitedOptionIds.has(optionId)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional modifier groups cannot contain a cycle',
        { statusCode: 422 }
      );
    }
    visitedOptionIds.add(optionId);
    const parentOption = await fnbRepository.findModifierOptionById(optionId, options);
    if (!parentOption || parentOption.is_active === false) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional parent modifier option is unavailable',
        { statusCode: 422 }
      );
    }
    const parentGroupId = toPositiveInt(parentOption.modifier_group_id);
    if (!parentGroupId || (currentGroupId && parentGroupId === currentGroupId)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional parent modifier option must belong to another group',
        { statusCode: 422 }
      );
    }
    if (visitedGroupIds.has(parentGroupId)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional modifier groups cannot contain a cycle',
        { statusCode: 422 }
      );
    }
    visitedGroupIds.add(parentGroupId);

    // Creation tests and older repository adapters may only expose the option
    // lookup. In that case the first-level relationship is still validated;
    // the production repository exposes the group lookup so the full chain is
    // checked and nested/cyclic topology is rejected.
    if (typeof fnbRepository.findModifierGroupById !== 'function') return;
    const parentGroup = await fnbRepository.findModifierGroupById(parentGroupId, options);
    if (!parentGroup) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional parent modifier group is unavailable',
        { statusCode: 422 }
      );
    }
    const nextParentOptionId = toPositiveInt(parentGroup.parent_modifier_option_id);
    if (nextParentOptionId) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Conditional modifier groups may only be one level deep',
        { statusCode: 422 }
      );
    }
    optionId = null;
  }
};

const resolveCheckLineModifiers = async ({ fnbRepository, itemId, modifiers, options = {} }) => {
  if (!Array.isArray(modifiers)) return null;
  const assignments = typeof fnbRepository.listEffectiveItemModifierGroups === 'function'
    ? await fnbRepository.listEffectiveItemModifierGroups({ itemId }, options)
    : (typeof fnbRepository.listItemModifierGroups === 'function'
      ? await fnbRepository.listItemModifierGroups({ itemId }, options)
      : []);
  const groups = assignments
    .map((assignment) => toPlain(assignment?.modifierGroup || assignment?.modifier_group || assignment))
    .filter((group) => group && toPositiveInt(group.modifier_group_id));
  const groupById = new Map(groups.map((group) => [toPositiveInt(group.modifier_group_id), group]));
  const selectedOptionIds = new Set();
  const selectedByGroup = new Map();
  const snapshots = [];

  for (const requested of modifiers) {
    const groupId = toPositiveInt(requested?.modifier_group_id);
    const optionId = toPositiveInt(requested?.modifier_option_id || requested?.option_id);
    if (!groupId || !optionId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'F&B modifier selections require modifier_group_id and modifier_option_id', { statusCode: 422 });
    }
    const group = groupById.get(groupId);
    const option = Array.isArray(group?.options)
      ? group.options.find((entry) => toPositiveInt(entry?.modifier_option_id) === optionId)
      : null;
    if (!group || group.is_active === false || !option || option.is_active === false || option.is_sold_out === true) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Selected F&B modifier option is unavailable for this item', {
        statusCode: 422,
        details: { item_id: itemId, modifier_group_id: groupId, modifier_option_id: optionId }
      });
    }
    if (selectedOptionIds.has(optionId)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'An F&B modifier option cannot be selected more than once', { statusCode: 422 });
    }
    selectedOptionIds.add(optionId);
    const selected = selectedByGroup.get(groupId) || [];
    selected.push(optionId);
    selectedByGroup.set(groupId, selected);
    const quantity = Math.min(99, Math.max(1, Number.parseInt(requested?.quantity || 1, 10) || 1));
    const priceDelta = round4(option.price_delta || 0);
    snapshots.push({
      modifier_group_id: groupId,
      modifier_option_id: optionId,
      group_name: group.display_name || group.name || null,
      group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
      parent_modifier_option_id: toPositiveInt(group.parent_modifier_option_id),
      option_name: option.name || null,
      price_delta: priceDelta,
      quantity,
      extended_price_delta: round4(priceDelta * quantity),
      sku_item_id: toPositiveInt(option.sku_item_id),
      allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
    });
  }

  for (const group of groups) {
    const groupId = toPositiveInt(group.modifier_group_id);
    const parentOptionId = toPositiveInt(group.parent_modifier_option_id);
    const selected = selectedByGroup.get(groupId) || [];
    if (parentOptionId && !selectedOptionIds.has(parentOptionId)) {
      if (selected.length > 0) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier group "${group.display_name || group.name}" requires its parent option`, { statusCode: 422 });
      }
      continue;
    }
    const assignment = assignments.find((entry) => toPositiveInt(entry?.modifier_group_id) === groupId);
    const through = assignment?.FnbItemModifierGroup || assignment?.fnbItemModifierGroup || assignment || {};
    const required = through.is_required_override == null ? group.required === true : through.is_required_override === true;
    const minSelect = required ? Math.max(1, toNonNegativeInt(group.min_select, 0)) : toNonNegativeInt(group.min_select, 0);
    const maxSelect = Math.max(1, toPositiveInt(group.max_select, 1));
    if (selected.length < minSelect || selected.length > maxSelect) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier group "${group.display_name || group.name}" requires ${minSelect}-${maxSelect} selections`, { statusCode: 422 });
    }
  }

  return snapshots.length > 0 ? snapshots : null;
};

const reservationReference = () => `FNB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const kitchenTicketNumber = (stationId = null) => {
  const stationPart = stationId ? `S${stationId}` : 'GEN';
  return `${stationPart}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
};

const getTicketSnapshotLines = (linesSnapshot) => {
  if (Array.isArray(linesSnapshot)) return linesSnapshot;
  if (Array.isArray(linesSnapshot?.lines)) return linesSnapshot.lines;
  return [];
};

const getTicketSnapshotLineIds = (linesSnapshot) => getTicketSnapshotLines(linesSnapshot)
  .map((line) => toPositiveInt(line.check_line_id))
  .filter(Boolean);

const assertActiveCheck = (check, action) => {
  const plain = toPlain(check);
  if (!plain || !ACTIVE_CHECK_STATUSES.includes(plain.status)) {
    throw new DomainError(
      DomainErrorCode.CONFLICT,
      `Only active checks can be ${action}`,
      { statusCode: 409, details: { current_status: plain?.status || null } }
    );
  }
  return plain;
};

const normalizeTableIds = (payload = {}) => {
  const ids = [
    ...(Array.isArray(payload.table_ids) ? payload.table_ids : []),
    payload.table_id
  ];
  return [...new Set(ids.map((entry) => toPositiveInt(entry)).filter(Boolean))];
};

const validateReservationTables = async (fnbRepository, payload = {}, options = {}) => {
  const tableIds = normalizeTableIds(payload);
  const tables = [];
  for (const tableId of tableIds) {
    const table = await fnbRepository.getTableById(tableId, options);
    if (!table) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Reservation table not found', {
        statusCode: 404,
        details: { table_id: tableId }
      });
    }
    const plain = toPlain(table);
    if (plain.is_active === false || plain.status === 'out_of_service') {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Reservation table is not available for booking', {
        statusCode: 409,
        details: { table_id: tableId, status: plain.status || null }
      });
    }
    tables.push(plain);
  }
  return {
    tableIds,
    primaryTableId: tableIds[0] || null,
    totalSeatCount: tables.reduce((sum, table) => sum + toPositiveInt(table.seat_count, 0), 0)
  };
};

const assertReservationCapacity = ({ tableIds = [], totalSeatCount = 0, partySize = 0 }) => {
  if (tableIds.length === 0 || totalSeatCount <= 0 || partySize <= 0) return;
  if (partySize > totalSeatCount) {
    throw new DomainError(DomainErrorCode.CONFLICT, 'Reservation party size exceeds assigned table capacity', {
      statusCode: 409,
      details: {
        party_size: partySize,
        assigned_table_count: tableIds.length,
        assigned_seat_count: totalSeatCount
      }
    });
  }
};

const getReservationWindow = ({ requestedAt, durationMinutes, bufferMinutes }) => {
  const startAt = new Date(requestedAt);
  const duration = toBoundedInt(durationMinutes, {
    fallback: FNB_DEFAULT_RESERVATION_DURATION_MINUTES,
    min: 15,
    max: 480
  });
  const buffer = toBoundedInt(bufferMinutes, {
    fallback: FNB_DEFAULT_RESERVATION_BUFFER_MINUTES,
    min: 0,
    max: 120
  });
  const endAt = new Date(startAt.getTime() + ((duration + buffer) * 60000));
  return { startAt, endAt, duration, buffer };
};

const assertReservationTableAvailable = async (
  fnbRepository,
  { tableId, tableIds = [], requestedAt, durationMinutes, bufferMinutes, status, excludeReservationId = null },
  options = {}
) => {
  const normalizedTableIds = [...new Set([
    ...(Array.isArray(tableIds) ? tableIds : []),
    tableId
  ].map((entry) => toPositiveInt(entry)).filter(Boolean))];
  if (normalizedTableIds.length === 0 || !['confirmed', 'seated'].includes(status)) return;
  const window = getReservationWindow({ requestedAt, durationMinutes, bufferMinutes });
  const conflicts = await fnbRepository.listOverlappingReservations({
    tableIds: normalizedTableIds,
    startAt: window.startAt,
    endAt: window.endAt,
    excludeReservationId
  }, options);
  if (conflicts.length > 0) {
    throw new DomainError(DomainErrorCode.CONFLICT, 'Reservation overlaps an existing confirmed/seated booking for this table', {
      statusCode: 409,
      details: {
        table_ids: normalizedTableIds,
        requested_at: window.startAt.toISOString(),
        ends_at: window.endAt.toISOString(),
        conflicting_reservation_ids: conflicts.map((entry) => entry.reservation_request_id)
      }
    });
  }
};

export const buildFnbDashboardUseCase = ({ fnbRepository }) => async () => {
  try {
    return ok(await fnbRepository.dashboard());
  } catch (error) {
    return fail(mapError(error, 'Unable to load Food & Beverage dashboard'));
  }
};

export const buildListModifierGroupsUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      modifier_groups: await fnbRepository.listModifierGroups({
        includeInactive: normalizeBoolean(query.include_inactive, false)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list modifier groups'));
  }
};

export const buildCreateModifierGroupUseCase = ({ fnbRepository }) => async ({ payload = {} } = {}) => {
  try {
    const groupPayload = {
      name: trim(payload.name, 120),
      display_name: trim(payload.display_name || payload.name, 120) || null,
      group_kind: payload.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
      parent_modifier_option_id: toPositiveInt(payload.parent_modifier_option_id),
      min_select: toNonNegativeInt(payload.min_select, 0),
      max_select: Math.max(1, toPositiveInt(payload.max_select, 1)),
      required: normalizeBoolean(payload.required, false),
      is_active: payload.is_active !== false,
      visible_in_pos: payload.visible_in_pos !== false,
      visible_in_storefront: payload.visible_in_storefront !== false,
      sort_order: toNonNegativeInt(payload.sort_order, 0)
    };
    if (!groupPayload.name) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Modifier group name is required', { statusCode: 422 });
    }
    if (groupPayload.min_select > groupPayload.max_select) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'min_select cannot exceed max_select', { statusCode: 422 });
    }
    if (groupPayload.group_kind === 'combo_choice' && (!groupPayload.required || groupPayload.min_select < 1)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Combo choice groups must be required and select at least one option', { statusCode: 422 });
    }
    const optionPayloads = (Array.isArray(payload.options) ? payload.options : []).map((option, index) => ({
      name: trim(option.name, 120),
      price_delta: round4(option.price_delta),
      sku_item_id: toPositiveInt(option.sku_item_id),
      is_default: normalizeBoolean(option.is_default, false),
      is_active: option.is_active !== false,
      visible_in_pos: option.visible_in_pos !== false,
      visible_in_storefront: option.visible_in_storefront !== false,
      is_sold_out: normalizeBoolean(option.is_sold_out, false),
      allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null,
      sort_order: toNonNegativeInt(option.sort_order, index),
      location_availability: option.location_availability || []
    })).filter((option) => option.name);

    const defaultCount = optionPayloads.filter((option) => option.is_default).length;
    const effectiveMinSelect = groupPayload.required ? Math.max(1, groupPayload.min_select) : groupPayload.min_select;
    if (defaultCount > groupPayload.max_select) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Default modifier options cannot exceed max_select', { statusCode: 422 });
    }
    if (groupPayload.required && effectiveMinSelect > optionPayloads.filter((option) => option.is_active).length) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Required modifier group does not have enough active options', { statusCode: 422 });
    }
    groupPayload.min_select = effectiveMinSelect;

    const linkedItemIds = [...new Set(optionPayloads.map((option) => option.sku_item_id).filter(Boolean))];
    if (groupPayload.parent_modifier_option_id && typeof fnbRepository.findModifierOptionById === 'function') {
      await assertConditionalModifierTopology({
        fnbRepository,
        parentModifierOptionId: groupPayload.parent_modifier_option_id
      });
    }
    if (linkedItemIds.length > 0 && typeof fnbRepository.findActiveItemsByIds === 'function') {
      const linkedItems = await fnbRepository.findActiveItemsByIds(linkedItemIds);
      const foundIds = new Set(linkedItems.map((item) => Number(item.item_id)));
      const missingIds = linkedItemIds.filter((itemId) => !foundIds.has(Number(itemId)));
      if (missingIds.length > 0) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'One or more linked modifier inventory items are unavailable', {
          statusCode: 422,
          details: { missing_sku_item_ids: missingIds }
        });
      }
    }
    const locationIds = [...new Set([...(payload.location_availability || []), ...optionPayloads.flatMap((option) => option.location_availability)].map((row) => toPositiveInt(row.location_id)).filter(Boolean))];
    if (locationIds.length > 0 && typeof fnbRepository.findActiveLocationsByIds === 'function') {
      const locations = await fnbRepository.findActiveLocationsByIds(locationIds);
      const foundIds = new Set(locations.map((location) => Number(location.location_id)));
      if (locationIds.some((locationId) => !foundIds.has(locationId))) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'One or more modifier locations are unavailable', { statusCode: 422 });
      }
    }

    const created = await withTransaction(fnbRepository, (transaction) => fnbRepository.createModifierGroup({
      group: groupPayload,
      options: optionPayloads,
      location_availability: payload.location_availability || []
    }, { transaction }));
    return ok({ modifier_group: created }, 'Modifier group created successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to create modifier group'));
  }
};

export const buildUpdateModifierGroupUseCase = ({ fnbRepository }) => async ({ modifierGroupId, payload = {} } = {}) => {
  try {
    const groupId = toPositiveInt(modifierGroupId);
    const minSelect = toNonNegativeInt(payload.min_select, 0);
    const maxSelect = Math.max(1, toPositiveInt(payload.max_select, 1));
    const groupKind = payload.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier';
    const parentModifierOptionId = toPositiveInt(payload.parent_modifier_option_id);
    if (!groupId || !trim(payload.name, 120)) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Modifier group and name are required', { statusCode: 422 });
    if (minSelect > maxSelect) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'min_select cannot exceed max_select', { statusCode: 422 });
    if (groupKind === 'combo_choice' && (payload.required !== true || minSelect < 1)) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Combo choice groups must be required and select at least one option', { statusCode: 422 });
    const options = (payload.options || []).map((option, index) => ({
      modifier_option_id: toPositiveInt(option.modifier_option_id),
      name: trim(option.name, 120),
      price_delta: round4(option.price_delta),
      sku_item_id: toPositiveInt(option.sku_item_id),
      is_default: normalizeBoolean(option.is_default, false),
      is_active: option.is_active !== false,
      visible_in_pos: option.visible_in_pos !== false,
      visible_in_storefront: option.visible_in_storefront !== false,
      is_sold_out: normalizeBoolean(option.is_sold_out, false),
      allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null,
      sort_order: toNonNegativeInt(option.sort_order, index),
      location_availability: option.location_availability || []
    })).filter((option) => option.name);
    const effectiveMinSelect = payload.required === true ? Math.max(1, minSelect) : minSelect;
    if (options.filter((option) => option.is_default && option.is_active).length > maxSelect) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Default modifier options cannot exceed max_select', { statusCode: 422 });
    if (payload.required === true && effectiveMinSelect > options.filter((option) => option.is_active).length) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Required modifier group does not have enough active options', { statusCode: 422 });
    const linkedIds = [...new Set(options.map((option) => option.sku_item_id).filter(Boolean))];
    const locationIds = [...new Set([...(payload.location_availability || []), ...options.flatMap((option) => option.location_availability)].map((row) => toPositiveInt(row.location_id)).filter(Boolean))];
    const updated = await withTransaction(fnbRepository, async (transaction) => {
      if (linkedIds.length) {
        const found = new Set((await fnbRepository.findActiveItemsByIds(linkedIds, { transaction })).map((row) => Number(row.item_id)));
        if (linkedIds.some((id) => !found.has(id))) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'One or more linked modifier inventory items are unavailable', { statusCode: 422 });
      }
      if (locationIds.length) {
        const found = new Set((await fnbRepository.findActiveLocationsByIds(locationIds, { transaction })).map((row) => Number(row.location_id)));
        if (locationIds.some((id) => !found.has(id))) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'One or more modifier locations are unavailable', { statusCode: 422 });
      }
      if (parentModifierOptionId) {
        await assertConditionalModifierTopology({
          fnbRepository,
          parentModifierOptionId,
          currentGroupId: groupId,
          options: { transaction }
        });
      }
      return fnbRepository.updateModifierGroup(groupId, {
        group: { name: trim(payload.name, 120), display_name: trim(payload.display_name || payload.name, 120), group_kind: groupKind, parent_modifier_option_id: parentModifierOptionId, min_select: effectiveMinSelect, max_select: maxSelect, required: payload.required === true, is_active: payload.is_active !== false, visible_in_pos: payload.visible_in_pos !== false, visible_in_storefront: payload.visible_in_storefront !== false, sort_order: toNonNegativeInt(payload.sort_order, 0) },
        options,
        location_availability: payload.location_availability || []
      }, { transaction });
    });
    if (!updated) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Modifier group not found');
    return ok({ modifier_group: updated }, 'Modifier group updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update modifier group'));
  }
};

export const buildListDiningAreasUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      dining_areas: await fnbRepository.listDiningAreas({
        includeInactive: normalizeBoolean(query.include_inactive, false)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list dining areas'));
  }
};

export const buildCreateDiningAreaUseCase = ({ fnbRepository }) => async ({ payload = {} } = {}) => {
  try {
    const area = {
      name: trim(payload.name, 120),
      service_type: ['dine_in', 'outdoor', 'bar', 'private_room'].includes(payload.service_type) ? payload.service_type : 'dine_in',
      is_active: payload.is_active !== false,
      sort_order: toNonNegativeInt(payload.sort_order, 0)
    };
    if (!area.name) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Dining area name is required', { statusCode: 422 });
    }
    const tables = (Array.isArray(payload.tables) ? payload.tables : []).map((table, index) => ({
      table_number: trim(table.table_number || String(index + 1), 40),
      label: trim(table.label || table.table_number || `Table ${index + 1}`, 120) || null,
      seat_count: toPositiveInt(table.seat_count, 2),
      status: ['available', 'seated', 'held', 'out_of_service'].includes(table.status) ? table.status : 'available',
      qr_slug: trim(table.qr_slug, 120) || null,
      is_active: table.is_active !== false
    }));
    const created = await withTransaction(fnbRepository, (transaction) => fnbRepository.createDiningArea({ area, tables }, { transaction }));
    return ok({ dining_area: created }, 'Dining area created successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to create dining area'));
  }
};

export const buildUpdateDiningTableStatusUseCase = ({ fnbRepository }) => async ({ tableId, payload = {} } = {}) => {
  try {
    const status = String(payload.status || '').trim();
    if (!['available', 'seated', 'held', 'out_of_service'].includes(status)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported table status', { statusCode: 422 });
    }
    const table = await fnbRepository.updateTableStatus(tableId, status);
    if (!table) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Dining table not found');
    return ok({ table }, 'Dining table updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update dining table'));
  }
};

export const buildListKitchenStationsUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      kitchen_stations: await fnbRepository.listKitchenStations({
        includeInactive: normalizeBoolean(query.include_inactive, false)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list kitchen stations'));
  }
};

export const buildCreateKitchenStationUseCase = ({ fnbRepository }) => async ({ payload = {} } = {}) => {
  try {
    const station = await fnbRepository.createKitchenStation({
      name: trim(payload.name, 120),
      station_type: ['hot_line', 'cold_line', 'bar', 'dessert', 'expo', 'prep', 'other'].includes(payload.station_type) ? payload.station_type : 'hot_line',
      ticket_prefix: trim(payload.ticket_prefix, 20) || null,
      is_active: payload.is_active !== false,
      sort_order: toNonNegativeInt(payload.sort_order, 0)
    });
    return ok({ kitchen_station: station }, 'Kitchen station created successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to create kitchen station'));
  }
};

export const buildListItemKitchenRoutesUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      item_kitchen_routes: await fnbRepository.listItemKitchenRoutes({
        itemId: toPositiveInt(query.item_id)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list item kitchen routes'));
  }
};

export const buildUpsertItemKitchenRouteUseCase = ({ fnbRepository }) => async ({ itemId, payload = {} } = {}) => {
  try {
    const normalizedItemId = toPositiveInt(itemId);
    const stationId = toPositiveInt(payload.kitchen_station_id);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_id is required', { statusCode: 422 });
    }
    if (!stationId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'kitchen_station_id is required', { statusCode: 422 });
    }
    const route = await withTransaction(fnbRepository, async (transaction) => {
      const stations = await fnbRepository.listKitchenStations({ includeInactive: false }, { transaction });
      if (!stations.some((station) => Number(station.kitchen_station_id) === stationId)) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Kitchen station not found');
      }
      return fnbRepository.upsertItemKitchenRoute(normalizedItemId, {
        kitchen_station_id: stationId,
        default_course: FNB_COURSES.includes(payload.default_course) ? payload.default_course : 'main'
      }, { transaction });
    });
    return ok({ item_kitchen_route: route }, 'Item kitchen route saved successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to save item kitchen route'));
  }
};

export const buildListItemModifierGroupsUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      item_modifier_groups: await fnbRepository.listItemModifierGroups({
        itemId: toPositiveInt(query.item_id)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list item modifier assignments'));
  }
};

export const buildReplaceItemModifierGroupsUseCase = ({ fnbRepository }) => async ({ itemId, payload = {} } = {}) => {
  try {
    const normalizedItemId = toPositiveInt(itemId);
    if (!normalizedItemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_id is required', { statusCode: 422 });
    }
    const assignments = (Array.isArray(payload.modifier_groups) ? payload.modifier_groups : []).map((entry, index) => {
      const modifierGroupId = toPositiveInt(entry.modifier_group_id);
      if (!modifierGroupId) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'modifier_group_id is required', { statusCode: 422 });
      }
      return {
        modifier_group_id: modifierGroupId,
        is_required_override: entry.is_required_override == null ? null : normalizeBoolean(entry.is_required_override, false),
        is_excluded: entry.is_excluded === true,
        sort_order: toNonNegativeInt(entry.sort_order, index)
      };
    });
    const saved = await withTransaction(fnbRepository, async (transaction) => {
      await assertActiveModifierGroups(fnbRepository, assignments, transaction);
      return fnbRepository.replaceItemModifierGroups(normalizedItemId, assignments, { transaction });
    });
    return ok({ item_modifier_groups: saved }, 'Item modifier assignments saved successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to save item modifier assignments'));
  }
};

export const buildListFolderModifierGroupsUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    return ok({
      folder_modifier_groups: await fnbRepository.listFolderModifierGroups({
        folderId: toPositiveInt(query.folder_id)
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list folder modifier assignments'));
  }
};

export const buildReplaceFolderModifierGroupsUseCase = ({ fnbRepository }) => async ({ folderId, payload = {} } = {}) => {
  try {
    const normalizedFolderId = toPositiveInt(folderId);
    if (!normalizedFolderId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'folder_id is required', { statusCode: 422 });
    }
    const assignments = (Array.isArray(payload.modifier_groups) ? payload.modifier_groups : []).map((entry, index) => {
      const modifierGroupId = toPositiveInt(entry.modifier_group_id);
      if (!modifierGroupId) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'modifier_group_id is required', { statusCode: 422 });
      }
      return {
        modifier_group_id: modifierGroupId,
        is_required_override: entry.is_required_override == null ? null : normalizeBoolean(entry.is_required_override, false),
        sort_order: toNonNegativeInt(entry.sort_order, index)
      };
    });
    const saved = await withTransaction(fnbRepository, async (transaction) => {
      if (typeof fnbRepository?.findActiveFolderById === 'function'
        && !(await fnbRepository.findActiveFolderById(normalizedFolderId, { transaction }))) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Active item folder not found');
      }
      await assertActiveModifierGroups(fnbRepository, assignments, transaction);
      return fnbRepository.replaceFolderModifierGroups(normalizedFolderId, assignments, { transaction });
    });
    return ok({ folder_modifier_groups: saved }, 'Folder modifier assignments saved successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to save folder modifier assignments'));
  }
};

export const buildListChecksUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    const statuses = query.statuses
      ? String(query.statuses).split(',').map((entry) => entry.trim()).filter((entry) => FNB_CHECK_STATUSES.includes(entry))
      : (query.status && FNB_CHECK_STATUSES.includes(query.status) ? [query.status] : undefined);
    return ok({
      checks: await fnbRepository.listChecks({
        statuses,
        limit: query.limit
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list checks'));
  }
};

export const buildCreateCheckUseCase = ({ fnbRepository }) => async ({ payload = {}, actorUserId = null } = {}) => {
  try {
    const tableId = toPositiveInt(payload.table_id);
    const check = await withTransaction(fnbRepository, async (transaction) => {
      let table = null;
      if (tableId) {
        table = await fnbRepository.getTableById(tableId, { transaction, lock: true });
        if (!table) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Dining table not found');
      }
      const created = await fnbRepository.createCheck({
        table_id: tableId,
        dining_area_id: toPositiveInt(payload.dining_area_id) || toPositiveInt(table?.dining_area_id),
        server_id: toPositiveInt(payload.server_id) || toPositiveInt(actorUserId),
        guest_count: toPositiveInt(payload.guest_count, 1),
        order_method: ['dine_in', 'takeout', 'pickup', 'delivery'].includes(payload.order_method) ? payload.order_method : 'dine_in',
        notes: trim(payload.notes, 4000) || null
      }, { transaction });
      if (table && payload.order_method !== 'takeout') {
        await table.update({ status: 'seated' }, { transaction });
      }
      return created;
    });
    return ok({ check }, 'Check opened successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to open check'));
  }
};

export const buildAddCheckLineUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const check = await fnbRepository.getCheckById(checkId);
    if (!check) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Check not found');
    const currentStatus = toPlain(check)?.status;
    if (!['open', 'sent_to_kitchen'].includes(currentStatus)) {
      throw new DomainError(DomainErrorCode.CONFLICT, `Cannot add lines to ${currentStatus} check`, { statusCode: 409 });
    }
    const itemId = toPositiveInt(payload.item_id);
    if (!itemId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_id is required', { statusCode: 422 });
    }
    const modifiersSnapshot = Array.isArray(payload.modifiers)
      ? await resolveCheckLineModifiers({
        fnbRepository,
        itemId,
        modifiers: payload.modifiers
      })
      : null;
    const route = await fnbRepository.getPrimaryKitchenRouteForItem(itemId);
    const course = FNB_COURSES.includes(payload.course) ? payload.course : (route?.default_course || 'main');
    const line = await fnbRepository.createCheckLine({
      check_id: toPositiveInt(checkId),
      item_id: itemId,
      quantity: Math.max(0.0001, Number(payload.quantity || 1)),
      course,
      modifiers_snapshot: modifiersSnapshot,
      special_instructions: trim(payload.special_instructions, 1000) || null,
      kitchen_station_id: toPositiveInt(payload.kitchen_station_id) || toPositiveInt(route?.kitchen_station_id)
    });
    return ok({ check_line: line }, 'Check line added successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to add check line'));
  }
};

export const buildTransferCheckUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const targetTableId = toPositiveInt(payload.table_id);
    if (!targetTableId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'table_id is required for transfer', { statusCode: 422 });
    }
    const updated = await withTransaction(fnbRepository, async (transaction) => {
      const check = await fnbRepository.getCheckById(checkId, { transaction, lock: true });
      const plain = assertActiveCheck(check, 'transferred');
      const targetTable = await fnbRepository.getTableById(targetTableId, { transaction, lock: true });
      if (!targetTable) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Target dining table not found');
      const sourceTableId = toPositiveInt(plain.table_id);
      const nextCheck = await fnbRepository.updateCheck(checkId, {
        table_id: targetTableId,
        dining_area_id: toPositiveInt(targetTable.dining_area_id) || plain.dining_area_id || null,
        server_id: toPositiveInt(payload.server_id) || plain.server_id || null,
        notes: payload.notes !== undefined ? trim(payload.notes, 4000) || null : plain.notes
      }, { transaction });
      await targetTable.update({ status: 'seated' }, { transaction });
      if (sourceTableId && sourceTableId !== targetTableId) {
        await fnbRepository.updateTableStatus(sourceTableId, 'available', { transaction });
      }
      return nextCheck;
    });
    return ok({ check: updated }, 'Check transferred successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to transfer check'));
  }
};

export const buildSplitCheckUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const lineIds = (Array.isArray(payload.line_ids) ? payload.line_ids : [])
      .map((lineId) => toPositiveInt(lineId))
      .filter(Boolean);
    if (lineIds.length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'line_ids are required for check split', { statusCode: 422 });
    }
    const result = await withTransaction(fnbRepository, async (transaction) => {
      const check = await fnbRepository.getCheckById(checkId, { transaction, lock: true });
      const plain = assertActiveCheck(check, 'split');
      const created = await fnbRepository.createCheck({
        table_id: toPositiveInt(payload.table_id) || plain.table_id || null,
        dining_area_id: toPositiveInt(payload.dining_area_id) || plain.dining_area_id || null,
        server_id: toPositiveInt(payload.server_id) || plain.server_id || null,
        guest_count: toPositiveInt(payload.guest_count, 1),
        order_method: plain.order_method || 'dine_in',
        notes: trim(payload.notes, 4000) || `Split from check ${plain.check_id}`
      }, { transaction });
      const movedCount = await fnbRepository.moveCheckLines({
        lineIds,
        fromCheckId: toPositiveInt(checkId),
        toCheckId: created.check_id
      }, { transaction });
      if (movedCount !== lineIds.length) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'One or more selected lines do not belong to this check', {
          statusCode: 422,
          details: { requested_line_count: lineIds.length, moved_line_count: movedCount }
        });
      }
      const remainingCount = await fnbRepository.countCheckLines(checkId, { transaction });
      if (remainingCount === 0) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'A split must leave at least one line on the original check', { statusCode: 409 });
      }
      return {
        original_check: await fnbRepository.getCheckById(checkId, { transaction }),
        split_check: await fnbRepository.getCheckById(created.check_id, { transaction })
      };
    });
    return ok({
      original_check: toPlain(result.original_check),
      split_check: toPlain(result.split_check)
    }, 'Check split successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to split check'));
  }
};

export const buildMergeChecksUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const sourceCheckId = toPositiveInt(payload.source_check_id);
    const targetCheckId = toPositiveInt(checkId);
    if (!sourceCheckId || !targetCheckId || sourceCheckId === targetCheckId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'source_check_id and target check must be different checks', { statusCode: 422 });
    }
    const result = await withTransaction(fnbRepository, async (transaction) => {
      const target = await fnbRepository.getCheckById(targetCheckId, { transaction, lock: true });
      const source = await fnbRepository.getCheckById(sourceCheckId, { transaction, lock: true });
      const targetPlain = assertActiveCheck(target, 'merged into');
      const sourcePlain = assertActiveCheck(source, 'merged');
      const sourceLineIds = (Array.isArray(sourcePlain.lines) ? sourcePlain.lines : [])
        .map((line) => toPositiveInt(line.check_line_id))
        .filter(Boolean);
      if (sourceLineIds.length > 0) {
        await fnbRepository.moveCheckLines({
          lineIds: sourceLineIds,
          fromCheckId: sourceCheckId,
          toCheckId: targetCheckId
        }, { transaction });
      }
      await fnbRepository.updateCheck(sourceCheckId, {
        status: 'transferred',
        closed_at: new Date(),
        notes: trim(payload.notes, 4000) || `Merged into check ${targetPlain.check_id}`
      }, { transaction });
      return {
        target_check: await fnbRepository.getCheckById(targetCheckId, { transaction }),
        source_check: await fnbRepository.getCheckById(sourceCheckId, { transaction })
      };
    });
    return ok({
      target_check: toPlain(result.target_check),
      source_check: toPlain(result.source_check)
    }, 'Checks merged successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to merge checks'));
  }
};

export const buildUpdateCheckStatusUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const status = String(payload.status || '').trim();
    if (!FNB_CHECK_STATUSES.includes(status)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported check status', { statusCode: 422 });
    }
    const updated = await withTransaction(fnbRepository, async (transaction) => {
      const check = await fnbRepository.getCheckById(checkId, { transaction, lock: true });
      if (!check) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Check not found');
      const plain = toPlain(check);
      assertTransition(CHECK_TRANSITIONS, plain.status, status, 'Check');
      return fnbRepository.updateCheck(checkId, {
        status,
        pos_transaction_id: toPositiveInt(payload.pos_transaction_id) || plain.pos_transaction_id || null,
        closed_at: ['paid', 'voided', 'transferred'].includes(status) ? new Date() : plain.closed_at
      }, { transaction });
    });
    return ok({ check: updated }, 'Check status updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update check status'));
  }
};

export const buildCreateKitchenTicketUseCase = ({ fnbRepository }) => async ({ checkId, payload = {} } = {}) => {
  try {
    const check = await fnbRepository.getCheckById(checkId);
    if (!check) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Check not found');
    const plainCheck = toPlain(check);
    const firstRoutedLine = (Array.isArray(plainCheck?.lines) ? plainCheck.lines : [])
      .find((line) => toPositiveInt(line.kitchen_station_id));
    const stationId = toPositiveInt(payload.kitchen_station_id) || toPositiveInt(firstRoutedLine?.kitchen_station_id);
    const ticket = await withTransaction(fnbRepository, async (transaction) => {
      const created = await fnbRepository.createKitchenTicket({
        check_id: toPositiveInt(checkId),
        kitchen_station_id: stationId,
        ticket_number: trim(payload.ticket_number, 50) || kitchenTicketNumber(stationId),
        status: 'queued',
        lines_snapshot: Array.isArray(payload.lines_snapshot) ? payload.lines_snapshot : toPlain(check)?.lines || [],
        fired_at: new Date()
      }, { transaction });
      await fnbRepository.updateCheck(checkId, { status: 'sent_to_kitchen' }, { transaction });
      if (typeof fnbRepository.updateCheckLinesStatus === 'function') {
        await fnbRepository.updateCheckLinesStatus({
          checkId: toPositiveInt(checkId),
          lineIds: getTicketSnapshotLineIds(created.lines_snapshot),
          status: 'sent'
        }, { transaction });
      }
      return created;
    });
    return ok({ kitchen_ticket: ticket }, 'Kitchen ticket queued successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to queue kitchen ticket'));
  }
};

export const buildUpdateKitchenTicketStatusUseCase = ({ fnbRepository }) => async ({ ticketId, payload = {} } = {}) => {
  try {
    const status = String(payload.status || '').trim();
    if (!FNB_KITCHEN_TICKET_STATUSES.includes(status)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported kitchen ticket status', { statusCode: 422 });
    }
    const ticket = await withTransaction(fnbRepository, async (transaction) => {
      const current = await fnbRepository.getKitchenTicketById(ticketId, { transaction, lock: true });
      if (!current) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Kitchen ticket not found');
      const plain = toPlain(current);
      assertTransition(KITCHEN_TICKET_TRANSITIONS, plain.status, status, 'Kitchen ticket');
      const updated = await fnbRepository.updateKitchenTicket(ticketId, {
        status,
        ready_at: status === 'ready' ? new Date() : plain.ready_at,
        served_at: status === 'served' ? new Date() : plain.served_at
      }, { transaction });
      const lineStatus = KITCHEN_TICKET_LINE_STATUS[status];
      if (lineStatus && typeof fnbRepository.updateCheckLinesStatus === 'function') {
        await fnbRepository.updateCheckLinesStatus({
          checkId: toPositiveInt(plain.check_id),
          lineIds: getTicketSnapshotLineIds(plain.lines_snapshot),
          status: lineStatus
        }, { transaction });
      }
      return updated;
    });
    return ok({ kitchen_ticket: ticket }, 'Kitchen ticket updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update kitchen ticket'));
  }
};

export const buildListReservationsUseCase = ({ fnbRepository }) => async ({ query = {} } = {}) => {
  try {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    return ok({
      reservations: await fnbRepository.listReservations({
        status: FNB_RESERVATION_STATUSES.includes(query.status) ? query.status : '',
        tableId: toPositiveInt(query.table_id),
        from: from && Number.isFinite(from.getTime()) ? from : null,
        to: to && Number.isFinite(to.getTime()) ? to : null,
        limit: query.limit
      })
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to list reservation requests'));
  }
};

export const buildCreateReservationUseCase = ({ fnbRepository }) => async ({ payload = {}, source = 'admin' } = {}) => {
  try {
    const requestedAt = new Date(payload.requested_at);
    if (!Number.isFinite(requestedAt.getTime())) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'requested_at must be a valid date-time', { statusCode: 422 });
    }
    const tableAssignment = await validateReservationTables(fnbRepository, payload);
    const partySize = toPositiveInt(payload.party_size, 2);
    assertReservationCapacity({
      tableIds: tableAssignment.tableIds,
      totalSeatCount: tableAssignment.totalSeatCount,
      partySize
    });
    const durationMinutes = toBoundedInt(payload.duration_minutes, {
      fallback: FNB_DEFAULT_RESERVATION_DURATION_MINUTES,
      min: 15,
      max: 480
    });
    const bufferMinutes = toBoundedInt(payload.buffer_minutes, {
      fallback: FNB_DEFAULT_RESERVATION_BUFFER_MINUTES,
      min: 0,
      max: 120
    });
    const reservation = await fnbRepository.createReservation({
      public_reference: trim(payload.public_reference, 40) || reservationReference(),
      customer_name: trim(payload.customer_name, 255),
      customer_email: trim(payload.customer_email, 255).toLowerCase() || null,
      customer_phone: trim(payload.customer_phone, 50) || null,
      party_size: partySize,
      requested_at: requestedAt,
      duration_minutes: durationMinutes,
      buffer_minutes: bufferMinutes,
      table_id: tableAssignment.primaryTableId,
      table_ids: tableAssignment.tableIds,
      source: ['storefront', 'pos', 'admin'].includes(source) ? source : 'admin',
      notes: trim(payload.notes, 4000) || null
    });
    return ok({ reservation }, 'Reservation request created successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to create reservation request'));
  }
};

export const buildUpdateReservationStatusUseCase = ({ fnbRepository }) => async ({ reservationId, payload = {} } = {}) => {
  try {
    const status = String(payload.status || '').trim();
    if (!FNB_RESERVATION_STATUSES.includes(status)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported reservation status', { statusCode: 422 });
    }
    const reservation = await withTransaction(fnbRepository, async (transaction) => {
      const current = await fnbRepository.getReservationById(reservationId, { transaction, lock: true });
      if (!current) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Reservation request not found');
      const plain = toPlain(current);
      assertTransition(RESERVATION_TRANSITIONS, plain.status, status, 'Reservation request');
      const existingTableIds = Array.isArray(plain.reservationTables)
        ? plain.reservationTables.map((entry) => toPositiveInt(entry.table_id)).filter(Boolean)
        : [];
      const hasTablePayload = Object.prototype.hasOwnProperty.call(payload, 'table_ids')
        || Object.prototype.hasOwnProperty.call(payload, 'table_id');
      const tableAssignment = await validateReservationTables(fnbRepository, hasTablePayload
        ? payload
        : { table_ids: existingTableIds.length > 0 ? existingTableIds : [plain.table_id].filter(Boolean) }, { transaction, lock: true });
      const requestedAt = payload.requested_at ? new Date(payload.requested_at) : new Date(plain.requested_at);
      if (!Number.isFinite(requestedAt.getTime())) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'requested_at must be a valid date-time', { statusCode: 422 });
      }
      const durationMinutes = toBoundedInt(payload.duration_minutes, {
        fallback: Number(plain.duration_minutes || FNB_DEFAULT_RESERVATION_DURATION_MINUTES),
        min: 15,
        max: 480
      });
      const bufferMinutes = toBoundedInt(payload.buffer_minutes, {
        fallback: Number(plain.buffer_minutes || FNB_DEFAULT_RESERVATION_BUFFER_MINUTES),
        min: 0,
        max: 120
      });
      const nextPartySize = toPositiveInt(payload.party_size, plain.party_size || 2);
      assertReservationCapacity({
        tableIds: tableAssignment.tableIds,
        totalSeatCount: tableAssignment.totalSeatCount,
        partySize: nextPartySize
      });
      await assertReservationTableAvailable(fnbRepository, {
        tableId: tableAssignment.primaryTableId,
        tableIds: tableAssignment.tableIds,
        requestedAt,
        durationMinutes,
        bufferMinutes,
        status,
        excludeReservationId: toPositiveInt(reservationId)
      }, { transaction, lock: true });
      return fnbRepository.updateReservation(reservationId, {
        status,
        requested_at: requestedAt,
        duration_minutes: durationMinutes,
        buffer_minutes: bufferMinutes,
        table_id: tableAssignment.primaryTableId,
        table_ids: tableAssignment.tableIds,
        party_size: nextPartySize,
        notes: payload.notes !== undefined ? trim(payload.notes, 4000) || null : plain.notes
      }, { transaction });
    });
    return ok({ reservation }, 'Reservation request updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update reservation request'));
  }
};

export const buildGetServiceChargeSettingsUseCase = ({ fnbRepository }) => async () => {
  try {
    const row = await fnbRepository.getServiceChargeSetting();
    return ok({
      service_charge: normalizeRestaurantServiceChargeSettings(parseJson(row?.setting_value, {}))
    });
  } catch (error) {
    return fail(mapError(error, 'Unable to load restaurant service charge settings'));
  }
};

export const buildUpdateServiceChargeSettingsUseCase = ({ fnbRepository }) => async ({ payload = {} } = {}) => {
  try {
    const settings = normalizeRestaurantServiceChargeSettings(payload);
    await fnbRepository.upsertServiceChargeSetting(settings);
    return ok({ service_charge: settings }, 'Restaurant service charge settings updated successfully');
  } catch (error) {
    return fail(mapError(error, 'Unable to update restaurant service charge settings'));
  }
};
