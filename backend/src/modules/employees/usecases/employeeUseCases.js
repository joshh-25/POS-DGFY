import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const mapError = (error, fallback) => {
  if (error instanceof DomainError) return error;
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return new DomainError(DomainErrorCode.CONFLICT, 'Employee code is already in use', { statusCode: 409 });
  }
  return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallback, { statusCode: 500 });
};
const requirePositiveInt = (value, label) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} must be a positive integer`, { statusCode: 422 });
  }
  return normalized;
};
const plain = (value) => value?.get ? value.get({ plain: true }) : value;

const validateLocation = async (repository, locationId, transaction) => {
  if (!locationId) return null;
  const location = await repository.findActiveLocation(locationId, { transaction });
  if (!location) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Selected employee location is not active', { statusCode: 422 });
  }
  return location.location_id;
};

export const buildListEmployeesUseCase = ({ repository }) => async ({ includeInactive = false } = {}) => {
  try {
    const employees = await repository.list({ includeInactive });
    return ok({ employees: employees.map(plain) });
  } catch (error) {
    return fail(mapError(error, 'Failed to load employees'));
  }
};

export const buildCreateEmployeeUseCase = ({ repository }) => async ({ payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const employeeCode = normalizeCode(payload.employee_code);
    if (await repository.findByCode(employeeCode, { transaction, lock: true })) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Employee code is already in use', { statusCode: 409 });
    }
    const locationId = await validateLocation(repository, payload.location_id, transaction);
    const employee = await repository.create({
      employee_code: employeeCode,
      full_name: payload.full_name.trim(),
      email: payload.email || null,
      phone: payload.phone || null,
      location_id: locationId,
      is_active: payload.is_active !== false,
      created_by: normalizedActorUserId,
      updated_by: normalizedActorUserId
    }, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee',
      entity_id: employee.employee_id,
      action: 'CREATE',
      changes: { employee_code: employeeCode, full_name: employee.full_name, location_id: locationId }
    }, { transaction });
    await transaction.commit();
    return ok({ employee: plain(employee) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to create employee'));
  }
};

export const buildUpdateEmployeeUseCase = ({ repository }) => async ({ employeeId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedEmployeeId = requirePositiveInt(employeeId, 'employeeId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const employee = await repository.findById(normalizedEmployeeId, { transaction, lock: true });
    if (!employee) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Employee was not found', { statusCode: 404 });
    }
    const updates = { updated_by: normalizedActorUserId };
    if (payload.employee_code !== undefined) {
      const employeeCode = normalizeCode(payload.employee_code);
      const duplicate = await repository.findByCode(employeeCode, { transaction, lock: true });
      if (duplicate && duplicate.employee_id !== normalizedEmployeeId) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Employee code is already in use', { statusCode: 409 });
      }
      updates.employee_code = employeeCode;
    }
    if (payload.full_name !== undefined) updates.full_name = payload.full_name.trim();
    if (payload.email !== undefined) updates.email = payload.email || null;
    if (payload.phone !== undefined) updates.phone = payload.phone || null;
    if (payload.location_id !== undefined) updates.location_id = await validateLocation(repository, payload.location_id, transaction);
    if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);
    await repository.update(employee, updates, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee',
      entity_id: normalizedEmployeeId,
      action: 'UPDATE',
      changes: updates
    }, { transaction });
    await transaction.commit();
    return ok({ employee: plain(employee) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to update employee'));
  }
};
