export const ERROR_TOAST_COOLDOWN_MS = 5000;

export const createErrorToastDeduper = (cooldownMs = ERROR_TOAST_COOLDOWN_MS) => {
  const recent = new Map();

  const prune = (now) => {
    recent.forEach((ts, key) => {
      if (now - ts >= cooldownMs) recent.delete(key);
    });
  };

  return {
    shouldSuppress(message, now = Date.now()) {
      const normalized = String(message || '').trim().toLowerCase();
      if (!normalized) return false;
      prune(now);
      const last = recent.get(normalized);
      if (last && now - last < cooldownMs) return true;
      recent.set(normalized, now);
      return false;
    }
  };
};

