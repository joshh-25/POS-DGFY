import { useState, useEffect, useCallback } from 'react';
import * as itemService from '../services/itemService.js';

export const useItems = (params = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await itemService.getItems(params);
      setItems(data.items || []);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, pagination, refetch: fetchItems };
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

