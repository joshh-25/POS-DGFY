export const USER_ROLES = Object.freeze(['admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo']);

export const ROLE_HIERARCHY = Object.freeze({
  admin: 7,
  manager: 6,
  po: 5,
  do: 5,
  jo: 5,
  cashier: 4,
  staff: 3
});

export const isAdminLikeRole = (role) => String(role || '').trim().toLowerCase() === 'admin';

