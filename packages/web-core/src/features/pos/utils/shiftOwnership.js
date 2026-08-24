const normalizeUserId = (value) => {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
};

export const resolvePosUserId = (user = {}) => (
  normalizeUserId(user?.user_id) || normalizeUserId(user?.id)
);

export const isShiftOwnedByUserId = (shift, userId) => {
  const normalizedShiftOwnerId = normalizeUserId(shift?.cashier_id);
  const normalizedUserId = normalizeUserId(userId);
  return Boolean(
    normalizedShiftOwnerId
    && normalizedUserId
    && normalizedShiftOwnerId === normalizedUserId
  );
};

export const isShiftOwnedByUser = (shift, user = {}) => (
  isShiftOwnedByUserId(shift, resolvePosUserId(user))
);
