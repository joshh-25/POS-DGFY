const cacheResetters = new Map();

export const registerClientCacheResetter = (name, resetter) => {
  if (!name || typeof resetter !== 'function') {
    return () => {};
  }

  cacheResetters.set(name, resetter);

  return () => {
    const current = cacheResetters.get(name);
    if (current === resetter) {
      cacheResetters.delete(name);
    }
  };
};

export const clearAllClientCaches = () => {
  cacheResetters.forEach((resetter, name) => {
    try {
      resetter();
    } catch (error) {
      console.warn(`[CacheRegistry] Failed to clear "${name}" cache`, error);
    }
  });
};

export const getRegisteredClientCaches = () => Array.from(cacheResetters.keys());
