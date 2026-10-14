export const resolveUserPermissionList = (user) => {
  if (Array.isArray(user?.permissions)) return user.permissions;
  if (typeof user?.permissions !== 'string') return [];
  try {
    const parsed = JSON.parse(user.permissions);
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];
    return Object.entries(parsed).flatMap(([entity, actions]) => (
      actions && typeof actions === 'object'
        ? Object.entries(actions)
          .filter(([, allowed]) => allowed === true)
          .map(([action]) => `${entity}:${action}`)
        : []
    ));
  } catch {
    return [];
  }
};

export const hasPosDiscountAuthorization = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  return user?.is_master_admin === true
    || ['admin', 'manager'].includes(role)
    || resolveUserPermissionList(user).includes('pos:discount_authorize');
};
