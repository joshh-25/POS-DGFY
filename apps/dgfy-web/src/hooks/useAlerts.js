import { useState, useEffect, useCallback } from 'react';
import * as alertService from '../services/alertService.js';

/**
 * Hook to fetch all alerts from the backend
 */
export const useAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alertService.getAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return { alerts, loading, error, refetch: fetchAlerts };
};

/**
 * Hook to fetch only expiry alerts from the backend
 */
export const useExpiryAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alertService.getExpiryAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch expiry alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return { alerts, loading, error, refetch: fetchAlerts };
};
