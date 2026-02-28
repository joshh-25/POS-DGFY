import { useState, useEffect, useCallback } from 'react';
import * as stockMovementService from '../services/stockMovementService.js';

export const useStockMovements = (params = {}) => {
  const [stockMovements, setStockMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const fetchStockMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await stockMovementService.getStockMovements(params);
      setStockMovements(data.movements || data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err.message || 'Failed to fetch stock movements');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchStockMovements();
  }, [fetchStockMovements]);

  return { stockMovements, loading, error, pagination, refetch: fetchStockMovements };
};

export const useMovementStats = (params = {}) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await stockMovementService.getMovementStats(params);
      setStats(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch movement statistics');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};

export const useCreateStockMovement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createStockMovement = useCallback(async (movementData) => {
    setLoading(true);
    setError(null);
    try {
      const movement = await stockMovementService.createStockMovement(movementData);
      return movement;
    } catch (err) {
      setError(err.message || 'Failed to create stock movement');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createStockMovement, loading, error };
};
