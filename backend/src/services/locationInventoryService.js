import dbStore from '../utils/dbStore.js';

const MULTI_LOCATION_FLAG_KEY = 'multi_location_inventory_enabled';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const parseBooleanSetting = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const toTransactionOptions = ({ transaction = null, lock = false } = {}) => {
  if (!transaction) return {};
  return {
    transaction,
    lock: lock ? transaction.LOCK.UPDATE : undefined
  };
};

export const isMultiLocationInventoryEnabled = async ({ transaction = null } = {}) => {
  const SystemSetting = dbStore.get('SystemSetting');
  if (!SystemSetting) return false;

  const setting = await SystemSetting.findOne({
    where: { setting_key: MULTI_LOCATION_FLAG_KEY },
    transaction
  });

  return parseBooleanSetting(setting?.setting_value, false);
};

export const listActiveLocations = async ({ transaction = null, lock = false } = {}) => {
  const TenantLocation = dbStore.get('TenantLocation');
  if (!TenantLocation) return [];

  return TenantLocation.findAll({
    where: { is_active: true },
    order: [
      ['is_primary_storefront', 'DESC'],
      ['is_open', 'DESC'],
      ['updated_at', 'DESC'],
      ['location_id', 'DESC']
    ],
    ...toTransactionOptions({ transaction, lock })
  });
};

export const resolveDefaultActiveLocation = async ({ transaction = null, lock = false } = {}) => {
  const locations = await listActiveLocations({ transaction, lock });
  return locations[0] || null;
};

export const assertLocationAccess = async ({
  userId,
  locationId,
  transaction = null,
  lock = false,
  operationLabel = 'inventory operation'
} = {}) => {
  const normalizedUserId = parsePositiveInt(userId);
  const normalizedLocationId = parsePositiveInt(locationId);

  if (!normalizedLocationId) {
    const error = new Error('location_id must be a positive integer');
    error.statusCode = 422;
    throw error;
  }

  if (!normalizedUserId) {
    return;
  }

  const User = dbStore.get('User');
  const UserLocationGrant = dbStore.get('UserLocationGrant');
  if (!User || !UserLocationGrant) return;

  const user = await User.findByPk(normalizedUserId, {
    ...toTransactionOptions({ transaction, lock })
  });
  if (!user) return;
  if (user.is_master_admin === true) return;

  const grants = await UserLocationGrant.findAll({
    where: { user_id: normalizedUserId },
    attributes: ['location_id'],
    ...toTransactionOptions({ transaction, lock })
  });

  const multiLocationEnabled = await isMultiLocationInventoryEnabled({ transaction });
  if (!Array.isArray(grants) || grants.length === 0) {
    if (multiLocationEnabled) {
      const error = new Error(
        `You do not have configured location grants to perform ${operationLabel}. `
        + 'Contact your administrator to assign at least one location.'
      );
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  const allowedLocationIds = new Set(grants.map((row) => Number(row.location_id)));
  if (!allowedLocationIds.has(Number(normalizedLocationId))) {
    const error = new Error(`You do not have location access to perform ${operationLabel} at location ${normalizedLocationId}.`);
    error.statusCode = 403;
    throw error;
  }
};

export const resolveMovementLocation = async ({
  requestedLocationId = null,
  userId = null,
  transaction = null,
  lock = false,
  operationLabel = 'inventory operation'
} = {}) => {
  const enabled = await isMultiLocationInventoryEnabled({ transaction });
  const locations = await listActiveLocations({ transaction, lock });
  const normalizedRequestedLocationId = parsePositiveInt(requestedLocationId);

  if (locations.length === 0) {
    if (!enabled) return null;
    const error = new Error('No active locations are configured. Configure at least one location before recording stock movements.');
    error.statusCode = 409;
    throw error;
  }

  let resolvedLocation;

  if (normalizedRequestedLocationId) {
    resolvedLocation = locations.find((location) => Number(location.location_id) === Number(normalizedRequestedLocationId)) || null;
    if (!resolvedLocation) {
      const error = new Error(`Location not found or inactive: ${normalizedRequestedLocationId}`);
      error.statusCode = 404;
      throw error;
    }
  } else if (enabled && locations.length > 1) {
    const error = new Error('location_id is required when multi-location inventory is enabled and more than one active location exists.');
    error.statusCode = 422;
    throw error;
  } else {
    resolvedLocation = locations[0];
  }

  if (!resolvedLocation) return null;

  await assertLocationAccess({
    userId,
    locationId: resolvedLocation.location_id,
    transaction,
    lock,
    operationLabel
  });

  return resolvedLocation;
};

export const resolveTransferLocations = async ({
  sourceLocationId,
  destinationLocationId,
  userId,
  transaction = null,
  lock = false,
  operationLabel = 'stock transfer'
} = {}) => {
  const enabled = await isMultiLocationInventoryEnabled({ transaction });
  const locations = await listActiveLocations({ transaction, lock });
  const sourceId = parsePositiveInt(sourceLocationId);
  const destinationId = parsePositiveInt(destinationLocationId);

  if (enabled && (!sourceId || !destinationId)) {
    const error = new Error('source_location_id and destination_location_id are required for transfers when multi-location inventory is enabled.');
    error.statusCode = 422;
    throw error;
  }

  if (!sourceId || !destinationId) {
    const fallback = locations[0] || null;
    if (!fallback) {
      const error = new Error('No active locations are configured for transfer.');
      error.statusCode = 409;
      throw error;
    }
    return {
      sourceLocation: fallback,
      destinationLocation: fallback
    };
  }

  if (sourceId === destinationId) {
    const error = new Error('source_location_id and destination_location_id must be different.');
    error.statusCode = 422;
    throw error;
  }

  const sourceLocation = locations.find((location) => Number(location.location_id) === Number(sourceId));
  const destinationLocation = locations.find((location) => Number(location.location_id) === Number(destinationId));
  if (!sourceLocation) {
    const error = new Error(`Source location not found or inactive: ${sourceId}`);
    error.statusCode = 404;
    throw error;
  }
  if (!destinationLocation) {
    const error = new Error(`Destination location not found or inactive: ${destinationId}`);
    error.statusCode = 404;
    throw error;
  }

  await assertLocationAccess({
    userId,
    locationId: sourceLocation.location_id,
    transaction,
    lock,
    operationLabel
  });
  await assertLocationAccess({
    userId,
    locationId: destinationLocation.location_id,
    transaction,
    lock,
    operationLabel
  });

  return { sourceLocation, destinationLocation };
};

export default {
  isMultiLocationInventoryEnabled,
  listActiveLocations,
  resolveDefaultActiveLocation,
  assertLocationAccess,
  resolveMovementLocation,
  resolveTransferLocations
};
