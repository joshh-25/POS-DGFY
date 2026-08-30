import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const mapError = (error, fallback) => {
  if (error instanceof DomainError) return error;
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return new DomainError(DomainErrorCode.CONFLICT, 'A delivery personnel record already exists', { statusCode: 409 });
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
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Selected delivery personnel location is not active', { statusCode: 422 });
  }
  return location.location_id;
};

export const buildListDeliveryPersonnelUseCase = ({ repository }) => async ({ includeInactive = true } = {}) => {
  try {
    const deliveryPersonnel = await repository.list({ includeInactive });
    return ok({ delivery_personnel: deliveryPersonnel.map(plain) });
  } catch (error) {
    return fail(mapError(error, 'Failed to load delivery personnel'));
  }
};

export const buildCreateDeliveryPersonnelUseCase = ({ repository }) => async ({ payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const displayName = payload.display_name.trim();
    const locationId = await validateLocation(repository, payload.location_id, transaction);
    const duplicate = await repository.findActiveByDisplayName(displayName, { locationId, transaction, lock: true });
    if (duplicate) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'An active delivery personnel record with this name already exists', { statusCode: 409 });
    }
    const deliveryPersonnel = await repository.create({
      display_name: displayName,
      phone: payload.phone || null,
      location_id: locationId,
      notes: payload.notes || null,
      is_active: payload.is_active !== false,
      created_by: normalizedActorUserId,
      updated_by: normalizedActorUserId
    }, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'delivery_personnel',
      entity_id: deliveryPersonnel.delivery_personnel_id,
      action: 'CREATE',
      changes: { display_name: displayName, location_id: locationId }
    }, { transaction });
    await transaction.commit();
    return ok({ delivery_personnel: plain(deliveryPersonnel) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to create delivery personnel'));
  }
};

export const buildUpdateDeliveryPersonnelUseCase = ({ repository }) => async ({ deliveryPersonnelId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedId = requirePositiveInt(deliveryPersonnelId, 'deliveryPersonnelId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const deliveryPersonnel = await repository.findById(normalizedId, { transaction, lock: true });
    if (!deliveryPersonnel) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Delivery personnel record was not found', { statusCode: 404 });
    }
    const updates = { updated_by: normalizedActorUserId };
    if (payload.display_name !== undefined) updates.display_name = payload.display_name.trim();
    if (payload.phone !== undefined) updates.phone = payload.phone || null;
    if (payload.notes !== undefined) updates.notes = payload.notes || null;
    if (payload.location_id !== undefined) updates.location_id = await validateLocation(repository, payload.location_id, transaction);
    if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);

    // Phase 205 (#1080) RF-2: the create-time duplicate-name guard has no PATCH equivalent --
    // a rename, a location move, or a reactivation can all land an active row on the same
    // case-insensitive name+location pair as another active row, which breaks the registry's
    // datalist name-to-ID match. Re-run the same guard whenever the update would leave the row
    // active under a name/location that isn't its current one.
    const nextDisplayName = updates.display_name !== undefined ? updates.display_name : deliveryPersonnel.display_name;
    const nextLocationId = updates.location_id !== undefined ? updates.location_id : deliveryPersonnel.location_id;
    const nextIsActive = updates.is_active !== undefined ? updates.is_active : deliveryPersonnel.is_active;
    if (nextIsActive) {
      const duplicate = await repository.findActiveByDisplayName(nextDisplayName, {
        locationId: nextLocationId,
        excludeId: normalizedId,
        transaction,
        lock: true
      });
      if (duplicate) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'An active delivery personnel record with this name already exists', { statusCode: 409 });
      }
    }

    await repository.update(deliveryPersonnel, updates, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'delivery_personnel',
      entity_id: normalizedId,
      action: 'UPDATE',
      changes: updates
    }, { transaction });
    await transaction.commit();
    return ok({ delivery_personnel: plain(deliveryPersonnel) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to update delivery personnel'));
  }
};
