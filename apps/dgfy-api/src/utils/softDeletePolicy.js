import { Op } from 'sequelize';

/**
 * Builds a "visible/active" where clause for manually soft-deleted entities.
 * By default this enforces deleted_at = null and, when configured, excludes inactive status.
 *
 * Pass `includeDeleted: true` to omit the deleted_at constraint entirely (e.g. a
 * "show inactive/deleted rows" admin view) -- every other option (statusField,
 * excludeInactiveStatus, and whatever else is already in `where`) still applies on top,
 * so tenant scope and status filtering behave the same regardless of this flag.
 */
export const buildVisibleWhere = (
  where = {},
  {
    deletedAtField = 'deleted_at',
    statusField = null,
    inactiveValue = 'inactive',
    excludeInactiveStatus = false,
    includeDeleted = false,
  } = {}
) => {
  const mergedWhere = { ...where };

  if (!includeDeleted) {
    mergedWhere[deletedAtField] = null;
  }

  if (excludeInactiveStatus && statusField) {
    mergedWhere[statusField] = { [Op.ne]: inactiveValue };
  }

  return mergedWhere;
};

export const notFoundError = (message = 'Resource not found') => {
  const error = new Error(message);
  Object.defineProperty(error, 'message', {
    value: message,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  error.statusCode = 404;
  return error;
};
