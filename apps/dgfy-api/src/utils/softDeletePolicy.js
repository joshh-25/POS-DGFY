import { Op } from 'sequelize';

/**
 * Builds a "visible/active" where clause for manually soft-deleted entities.
 * This enforces deleted_at = null and, when configured, excludes inactive status.
 */
export const buildVisibleWhere = (
  where = {},
  {
    deletedAtField = 'deleted_at',
    statusField = null,
    inactiveValue = 'inactive',
    excludeInactiveStatus = false,
  } = {}
) => {
  const mergedWhere = {
    ...where,
    [deletedAtField]: null,
  };

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
