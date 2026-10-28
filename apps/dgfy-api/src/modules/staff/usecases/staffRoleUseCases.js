import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { STAFF_CAPABILITIES, isKnownStaffCapability } from '../../shared/constants/staffCapabilities.js';
import dbStore from '../../../utils/dbStore.js';
import { plain, applyStaffRoleAssignmentInTransaction } from '../repositories/staffRoleRepository.js';

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
const audit = (repository, actor, entityId, action, changes, transaction, entityType = 'staff_role') => repository.createAuditLog({ user_id: actor, entity_type: entityType, entity_id: entityId, action, changes }, { transaction });
const run = async (repository, work, fallback, onCommit) => {
  const transaction = await (dbStore.getStore()?.sequelize || dbStore.get('sequelize')).transaction();
  try {
    const result = await work(transaction);
    await transaction.commit();
    onCommit?.();
    return ok(result);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(errorMap(error, fallback));
  }
};
const evictUsers = (invalidateUserCache, tenantId, userIds) => {
  if (!invalidateUserCache || !userIds.length) return;
  setImmediate(() => userIds.forEach((userId) => invalidateUserCache(tenantId, userId)));
};

export const buildCreateStaffRoleUseCase = ({ repository }) => ({ payload, actorUserId }) => run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId');
  const name = String(payload?.name || '').trim();
  if (!name || name.length > 120) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name is required and must be at most 120 characters', { statusCode: 422 });
  const role = await repository.create({ name, capabilities: capabilities(payload.capabilities), is_active: payload.is_active !== false, created_by: actor, updated_by: actor }, { transaction });
  await audit(repository, actor, role.staff_role_id, 'CREATE', { name, capabilities: role.capabilities }, transaction);
  return { role: plain(role) };
}, 'Failed to create staff role');

export const buildUpdateStaffRoleUseCase = ({ repository, invalidateUserCache }) => ({ staffRoleId, payload, actorUserId }) => {
  let affectedUserIds = [];
  const tenantId = dbStore.getStore()?.tenantId;
  return run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId'); const role = await repository.findById(id(staffRoleId, 'staffRoleId'), { transaction, lock: true });
  if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 });
  const updates = { updated_by: actor }; if (payload.name !== undefined) { const name = String(payload.name).trim(); if (!name || name.length > 120) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name must be at most 120 characters', { statusCode: 422 }); updates.name = name; } if (payload.capabilities !== undefined) updates.capabilities = capabilities(payload.capabilities);
  await repository.update(role, updates, { transaction }); await audit(repository, actor, role.staff_role_id, 'UPDATE', updates, transaction);
  affectedUserIds = (await repository.findUsersByRoleId(role.staff_role_id, { transaction })).map((user) => user.user_id);
  return { role: plain(role) };
}, 'Failed to update staff role', () => evictUsers(invalidateUserCache, tenantId, affectedUserIds));
};

export const buildSetStaffRoleStatusUseCase = ({
  repository,
  invalidateUserCache,
  synchronizeInvitationCancellations,
  logger = null
}) => async ({ staffRoleId, isActive, actorUserId }) => {
  let affectedUserIds = [];
  let cancelledInvitationCount = 0;
  const tenantId = dbStore.getStore()?.tenantId;
  const actor = id(actorUserId, 'actorUserId');
  const normalizedRoleId = id(staffRoleId, 'staffRoleId');
  const deactivating = !Boolean(isActive);
  const cancelledAt = new Date();
  const result = await run(repository, async (transaction) => {
    const role = await repository.findById(normalizedRoleId, { transaction, lock: true });
    if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 });

    const previousIsActive = Boolean(role.is_active);
    const statusChanged = previousIsActive !== Boolean(isActive);
    if (statusChanged) {
      await repository.update(role, { is_active: Boolean(isActive), updated_by: actor }, { transaction });
    }

    if (deactivating) {
      const cancellation = await repository.cancelPendingInvitationsForRole(role.staff_role_id, {
        actorUserId: actor,
        cancelledAt,
        transaction
      });
      cancelledInvitationCount = cancellation?.count || 0;
    }

    if (statusChanged) {
      await audit(repository, actor, role.staff_role_id, 'UPDATE', {
        is_active: Boolean(isActive),
        previous_is_active: previousIsActive,
        cancelled_pending_invitations_count: cancelledInvitationCount
      }, transaction);
    }

    affectedUserIds = (await repository.findUsersByRoleId(role.staff_role_id, { transaction })).map((user) => user.user_id);
    return { role: plain(role), cancelled_invitation_count: cancelledInvitationCount };
  }, 'Failed to update staff role status', () => evictUsers(invalidateUserCache, tenantId, affectedUserIds));

  if (!result.success || !deactivating) return result;

  try {
    const synchronization = await synchronizeInvitationCancellations?.({
      tenantId,
      staffRoleId: normalizedRoleId,
      actorUserId: actor,
      cancelledAt
    });
    return ok({
      ...result.data,
      invitation_sync_status: synchronizeInvitationCancellations ? 'complete' : 'not_configured',
      cancelled_invitation_count: Math.max(cancelledInvitationCount, synchronization?.cancelled_count || 0)
    });
  } catch (error) {
    logger?.error?.('[Staff roles] Invitation registry synchronization failed after role deactivation', {
      tenant_id: tenantId,
      staff_role_id: normalizedRoleId,
      cancelled_invitation_count: cancelledInvitationCount,
      error_name: error?.name || 'Error'
    });
    return ok({
      ...result.data,
      invitation_sync_status: 'retry_required',
      cancelled_invitation_count: cancelledInvitationCount,
      invitation_sync_message: 'Role deactivation and invitation cancellation were saved, but invitation registry synchronization needs retry.'
    });
  }
};

export const buildAssignStaffRoleToUserUseCase = ({ repository, invalidateUserCache }) => ({ userId, staffRoleId, actorUserId }) => {
  let affectedUserId = null;
  const tenantId = dbStore.getStore()?.tenantId;
  return run(repository, async (transaction) => {
  const actor = id(actorUserId, 'actorUserId');
  const normalizedRoleId = staffRoleId == null || staffRoleId === '' ? null : id(staffRoleId, 'staffRoleId');
  let role = null;
  if (normalizedRoleId) {
    role = await repository.findById(normalizedRoleId, { transaction, lock: true });
    if (!role) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Staff role was not found', { statusCode: 404 });
    if (!role.is_active) throw new DomainError(DomainErrorCode.CONFLICT, 'Inactive staff roles cannot be assigned', { statusCode: 409 });
  }
  const target = await repository.findUserById(id(userId, 'userId'), { transaction, lock: true });
  if (!target) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'User was not found', { statusCode: 404 });
  const assignment = await applyStaffRoleAssignmentInTransaction({
    repository,
    target,
    role,
    actorUserId: actor,
    transaction,
    auditEntityType: 'user'
  });
  affectedUserId = target.user_id;
  return { assignment };
}, 'Failed to assign staff role', () => evictUsers(invalidateUserCache, tenantId, affectedUserId ? [affectedUserId] : []));
};
