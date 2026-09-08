// One read plus at most one queued rerun for each authorized catalog query.
export const createCatalogReadCoordinator = () => {
  const requests = new Map();
  return (key, read) => {
    const existing = requests.get(key);
    if (existing) { existing.rerun = true; return existing.promise; }
    const entry = { rerun: false };
    entry.promise = (async () => {
      let result;
      do {
        entry.rerun = false;
        result = await read();
      } while (entry.rerun);
      return result;
    })().finally(() => requests.delete(key));
    requests.set(key, entry);
    return entry.promise;
  };
};

export const preserveCatalogRows = (previous, next) => {
  const old = new Map(previous.map((item) => [item.item_id, item]));
  return next.map((item) => {
    const prior = old.get(item.item_id);
    return prior && JSON.stringify(prior) === JSON.stringify(item) ? prior : item;
  });
};
