import dbStore from '../../../utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';

const denied = (message, reasonCode) => new DomainError(
  DomainErrorCode.AUTHORIZATION_FAILED,
  message,
  { statusCode: 403, details: { reason_code: reasonCode } }
);

const hasLocationGrant = async (userId, locationId, transaction) => {
  if (!locationId) return false;
  const User = dbStore.get('User');
  const user = await User.findByPk(userId, { attributes: ['user_id', 'is_master_admin'], transaction });
  if (user?.is_master_admin === true) return true;
  const grant = await dbStore.get('UserLocationGrant').findOne({
    where: { user_id: userId, location_id: locationId },
    transaction
  });
  return Boolean(grant);
};

export const assertStaffAssignment = async ({ user, resourceType, resourceId, transaction = null } = {}) => {
  if (hasEffectivePermission(user, PERMISSIONS.POS.actions.TRANSACT_POS)) return;
  const userId = Number.parseInt(user?.user_id, 10);
  if (!Number.isInteger(userId) || userId <= 0) throw denied('Authenticated staff user is required.', 'NOT_PERMITTED');

  if (resourceType === 'order') {
    if (!hasEffectivePermission(user, PERMISSIONS.STAFF_FULFILLMENT.actions.PACK_ASSIGNED_ORDERS)) {
      throw denied('You are not permitted to pack assigned orders.', 'NOT_PERMITTED');
    }
    const order = await dbStore.get('PosTransaction').findByPk(resourceId, { transaction, lock: transaction ? true : undefined });
    if (!order || order.packed_at != null) throw denied('This order is no longer assigned to you.', 'NO_LONGER_ASSIGNED');
    if (!(await hasLocationGrant(userId, order.location_id, transaction))) {
      throw denied('This order is no longer assigned to you.', 'NO_LONGER_ASSIGNED');
    }
    return;
  }

  if (resourceType === 'delivery_run') {
    if (!hasEffectivePermission(user, PERMISSIONS.STAFF_FULFILLMENT.actions.ACT_ASSIGNED_DELIVERY_RUNS)) {
      throw denied('You are not permitted to act on assigned delivery runs.', 'NOT_PERMITTED');
    }
    const personnel = await dbStore.get('DeliveryPersonnel').findOne({ where: { user_id: userId, is_active: true }, transaction });
    const membership = personnel && await dbStore.get('DeliveryRunPersonnel').findOne({
      where: { delivery_run_id: resourceId, delivery_personnel_id: personnel.delivery_personnel_id },
      transaction
    });
    if (!membership) throw denied('This delivery run is no longer assigned to you.', 'NO_LONGER_ASSIGNED');
    return;
  }

  throw denied('The requested staff assignment is not supported.', 'NOT_PERMITTED');
};

export const assertStaffLocationAccess = async ({ userId, locationId, transaction = null } = {}) => {
  const normalizedLocationId = Number.parseInt(locationId, 10);
  if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer', { statusCode: 422 });
  }
  const user = await dbStore.get('User').findByPk(userId, { attributes: ['user_id', 'is_master_admin'], transaction });
  if (user?.is_master_admin === true) return;
  const grant = await dbStore.get('UserLocationGrant').findOne({ where: { user_id: userId, location_id: normalizedLocationId }, transaction });
  if (!grant) throw denied('You do not have access to this location.', 'LOCATION_NOT_GRANTED');
};
