import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { STAFF_CAPABILITIES, isKnownStaffCapability } from '../../shared/constants/staffCapabilities.js';
import dbStore from '../../../utils/dbStore.js';
import { plain } from '../repositories/staffRoleRepository.js';

const errorMap = (error, fallback) => {
  if (error instanceof DomainError) return error;
  if (error?.name === 'SequelizeUniqueConstraintError') return new DomainError(DomainErrorCode.CONFLICT, 'A staff role with this name already exists', { statusCode: 409 });
  return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallback, { statusCode: 500 });
};
const id = (value, label) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} must be a positive integer`, { statusCode: 422 });
  return n;
};
const capabilities = (value) => {
  const list = Array.isArray(value) ? [...new Set(value.map((v) => String(v).trim()))] : [];
  const invalid = list.filter((value) => !isKnownStaffCapability(value));
  if (invalid.length) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unknown staff capability slug', { statusCode: 422, details: { unknown_capabilities: invalid, allowed_capabilities: STAFF_CAPABILITIES } });
  return list;
};
const audit = (repository, actor, entityId, action, changes, transaction) => repository.createAuditLog({ user_id: actor, entity_type: 'staff_role', entity_id: entityId, action, changes }, { transaction });
const run = async (repository, work, fallback) => {
  const transaction = await (dbStore.getStore()?.sequelize || dbStore.get('sequelize')).transaction();
  try { const result = await work(transaction); await transaction.commit(); return ok(result); } catch (error) { if (!transaction.finished) await transaction.rollback(); return fail(errorMap(error, fallback)); }
};

export const buildCreateStaffRoleUseCase = ({ repository }) => ({ payload, actorUserId }) => run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId');
  const name = String(payload?.name || '').trim();
  if (!name || name.length > 120) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name is required and must be at most 120 characters', { statusCode: 422 });
  const role = await repository.create({ name, capabilities: capabilities(payload.capabilities), is_active: payload.is_active !== false, created_by: actor, updated_by: actor }, { transaction });
  await audit(repository, actor, role.staff_role_id, 'CREATE', { name, capabilities: role.capabilities }, transaction);
  return { role: plain(role) };
}, 'Failed to create staff role');

export const buildUpdateStaffRoleUseCase = ({ repository }) => ({ staffRoleId, payload, actorUserId }) => run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId'); const role = await repository.findById(id(staffRoleId, 'staffRoleId'), { transaction, lock: true });
  if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 });
  const updates = { updated_by: actor }; if (payload.name !== undefined) { const name = String(payload.name).trim(); if (!name || name.length > 120) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name must be at most 120 characters', { statusCode: 422 }); updates.name = name; } if (payload.capabilities !== undefined) updates.capabilities = capabilities(payload.capabilities);
  await repository.update(role, updates, { transaction }); await audit(repository, actor, role.staff_role_id, 'UPDATE', updates, transaction); return { role: plain(role) };
}, 'Failed to update staff role');

export const buildSetStaffRoleStatusUseCase = ({ repository }) => ({ staffRoleId, isActive, actorUserId }) => run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId'); const role = await repository.findById(id(staffRoleId, 'staffRoleId'), { transaction, lock: true }); if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 });
  await repository.update(role, { is_active: Boolean(isActive), updated_by: actor }, { transaction }); await audit(repository, actor, role.staff_role_id, 'UPDATE', { is_active: role.is_active }, transaction); return { role: plain(role) };
}, 'Failed to update staff role status');

export const buildAssignStaffRoleToUserUseCase = ({ repository, invalidateUserCache }) => ({ userId, staffRoleId, actorUserId }) => run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId'); const target = await repository.findUserById(id(userId, 'userId'), { transaction, lock: true }); if (!target) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'User was not found', { statusCode: 404 });
  let role = null; const normalizedRoleId = staffRoleId == null || staffRoleId === '' ? null : id(staffRoleId, 'staffRoleId'); if (normalizedRoleId) { role = await repository.findById(normalizedRoleId, { transaction }); if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 }); if (!role.is_active) throw new DomainError(DomainErrorCode.CONFLICT, 'Inactive staff roles cannot be assigned', { statusCode: 409 }); }
  await target.update({ staff_role_id: normalizedRoleId }, { transaction }); await audit(repository, actor, target.user_id, 'UPDATE', { staff_role_id: normalizedRoleId }, transaction); const result = { user_id: target.user_id, staff_role_id: normalizedRoleId, staff_role: role ? plain(role) : null }; const tenantId = dbStore.getStore()?.tenantId; setImmediate(() => invalidateUserCache?.(tenantId, target.user_id)); return { assignment: result };
}, 'Failed to assign staff role');
