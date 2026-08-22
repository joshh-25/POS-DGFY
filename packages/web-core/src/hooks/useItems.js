import { useState, useEffect, useCallback, useRef } from 'react';
import * as itemService from '../services/itemService.js';
import { registerClientCacheResetter } from '../services/cacheRegistry.js';
import { getAuthEpoch } from '../services/sessionCleanup.js';
import { getCompanyToken } from '../services/browserSession.js';

// Module-level cache: deduplicates identical concurrent fetches across all hook instances.
// Key = session-scoped params signature, value = { promise, data, error, ts }
// Cache entries expire after 30 seconds so a manual refetch() always gets fresh data.
const CACHE_TTL_MS = 30_000;
const cache = new Map();

export const clearItemsCache = () => cache.clear();

registerClientCacheResetter('useItems', clearItemsCache);

export const buildItemsCacheScope = (params) => JSON.stringify({
  params,
  companyToken: getCompanyToken() || '',
  authEpoch: getAuthEpoch()
});

const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry;
};

export const useItems = (params = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  // #682: the backend's optional per-branch stock overlay reports whether it actually applied
  // (location_id omitted -> null/tenant-wide; requested but the tenant's schema doesn't support
  // it yet -> resolved:false) so callers like ItemsPage can render the correct scope label.
  const [locationScope, setLocationScope] = useState(null);
  const paramsKey = JSON.stringify(params);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const getScopedCacheKey = () => buildItemsCacheScope(paramsRef.current);

  const fetchItems = useCallback(async ({ bust = false } = {}) => {
    const key = getScopedCacheKey();
    const requestParams = paramsRef.current;

    if (!bust) {
      const cached = getCached(key);
      if (cached?.data) {
        setItems(cached.data.items || []);
        setPagination(cached.data.pagination);
        setLocationScope(cached.data.location_scope || null);
        setLoading(false);
        setError(null);
        return;
      }
      // Deduplicate: if an identical fetch is already in-flight, await it
      if (cached?.promise) {
        setLoading(true);
        try {
          const data = await cached.promise;
          setItems(data.items || []);
          setPagination(data.pagination);
          setLocationScope(data.location_scope || null);
          setError(null);
        } catch (err) {
          setError(err.message || 'Failed to fetch items');
        } finally {
          setLoading(false);
        }
        return;
      }
    } else {
      cache.delete(key);
    }

    setLoading(true);
    setError(null);

    const promise = itemService.getItems(requestParams);
    cache.set(key, { promise, data: null, ts: Date.now() });

    try {
      const data = await promise;
      cache.set(key, { promise: null, data, ts: Date.now() });
      setItems(data.items || []);
      setPagination(data.pagination);
      setLocationScope(data.location_scope || null);
    } catch (err) {
      cache.delete(key); // don't cache errors — allow next mount to retry
      setError(err.message || 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchItems();
  }, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, loading, error, pagination, locationScope, refetch: () => fetchItems({ bust: true }) };
};

export const useItemById = (itemId) => {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchItem = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await itemService.getItemById(itemId);
      setItem(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch item');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  return { item, loading, error, refetch: fetchItem };
};

export const useCreateItem = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createItem = useCallback(async (itemData) => {
    setLoading(true);
    setError(null);
    try {
      const item = await itemService.createItem(itemData);
      return item;
    } catch (err) {
      setError(err.message || 'Failed to create item');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createItem, loading, error };
};

export const useUpdateItem = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateItem = useCallback(async (itemId, itemData) => {
    setLoading(true);
    setError(null);
    try {
      const item = await itemService.updateItem(itemId, itemData);
      return item;
    } catch (err) {
      setError(err.message || 'Failed to update item');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateItem, loading, error };
};

export const useDeleteItem = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const deleteItem = useCallback(async (itemId) => {
    setLoading(true);
    setError(null);
    try {
      await itemService.deleteItem(itemId);
    } catch (err) {
      setError(err.message || 'Failed to delete item');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteItem, loading, error };
};

export const useCreateItemDraft = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createItemDraft = useCallback(async (itemData) => {
    setLoading(true);
    setError(null);
    try {
      const item = await itemService.createItemDraft(itemData);
      return item;
    } catch (err) {
      setError(err.message || 'Failed to save item draft');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createItemDraft, loading, error };
};

export const useFinalizeItem = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const finalizeItem = useCallback(async (itemId, itemData = {}) => {
    setLoading(true);
    setError(null);
    try {
      const item = await itemService.finalizeItem(itemId, itemData);
      return item;
    } catch (err) {
      setError(err.message || 'Failed to finalize item');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { finalizeItem, loading, error };
};

/**
 * Hook to fetch item supplier coverage data
 * Returns items with and without supplier assignments
 */
export const useItemSupplierCoverage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await itemService.getItemSupplierCoverage();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to fetch item supplier coverage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  return {
    itemsWithSupplier: data?.items_with_supplier || [],
    itemsWithoutSupplier: data?.items_without_supplier || [],
    summary: data?.summary || null,
    loading,
    error,
    refetch: fetchCoverage
  };
};

export const useFolders = () => {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await itemService.getFolders();
      setFolders(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch folders');
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (name, description) => {
    const createdFolder = await itemService.createFolder({ name, description });
    await fetchFolders(); // Refresh list
    return createdFolder;
  }, [fetchFolders]);

  const updateFolder = useCallback(async (folderId, payload) => {
    await itemService.updateFolder(folderId, payload);
    await fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  return { folders, loading, error, refetch: fetchFolders, createFolder, updateFolder };
};
