import { useState, useEffect, useCallback } from 'react';
import * as jobOrderService from '../services/jobOrderService.js';

export const useJobOrders = (params = {}) => {
  const [jobOrders, setJobOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchJobOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await jobOrderService.getJobOrders(params);
      // Handle both snake_case (job_orders) and camelCase (jobOrders) responses
      const orders = data.job_orders || data.jobOrders || (Array.isArray(data) ? data : []);
      setJobOrders(orders);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch job orders');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchJobOrders();
  }, [fetchJobOrders]);

  return { jobOrders, loading, error, pagination, refetch: fetchJobOrders };
};

export const useJobOrderById = (joId) => {
  const [jobOrder, setJobOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobOrder = useCallback(async () => {
    if (!joId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await jobOrderService.getJobOrderById(joId);
      setJobOrder(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch job order');
    } finally {
      setLoading(false);
    }
  }, [joId]);

  useEffect(() => {
    fetchJobOrder();
  }, [fetchJobOrder]);

  return { jobOrder, loading, error, refetch: fetchJobOrder };
};

export const useCreateJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createJobOrder = useCallback(async (joData) => {
    setLoading(true);
    setError(null);
    try {
      const jobOrder = await jobOrderService.createJobOrder(joData);
      return jobOrder;
    } catch (err) {
      setError(err.message || 'Failed to create job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createJobOrder, loading, error };
};

export const useCompleteJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const completeJobOrder = useCallback(async (joId, expiryDateOverride, notes = null, quantityProduced = null) => {
    setLoading(true);
    setError(null);
    try {
      const jobOrder = await jobOrderService.completeJobOrder(joId, expiryDateOverride, notes, quantityProduced);
      return jobOrder;
    } catch (err) {
      setError(err.message || 'Failed to complete job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { completeJobOrder, loading, error };
};

export const useCreateJobOrderDraft = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createJobOrderDraft = useCallback(async (joData) => {
    setLoading(true);
    setError(null);
    try {
      const jobOrder = await jobOrderService.createJobOrderDraft(joData);
      return jobOrder;
    } catch (err) {
      setError(err.message || 'Failed to save job order draft');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createJobOrderDraft, loading, error };
};

export const useFinalizeJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const finalizeJobOrder = useCallback(async (joId) => {
    setLoading(true);
    setError(null);
    try {
      const jobOrder = await jobOrderService.finalizeJobOrder(joId);
      return jobOrder;
    } catch (err) {
      setError(err.message || 'Failed to finalize job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { finalizeJobOrder, loading, error };
};

export const useArchiveJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const archiveJobOrder = useCallback(async (joId) => {
    setLoading(true);
    setError(null);
    try {
      await jobOrderService.archiveJobOrder(joId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to archive job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { archiveJobOrder, loading, error };
};

export const useRestoreJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const restoreJobOrder = useCallback(async (joId) => {
    setLoading(true);
    setError(null);
    try {
      await jobOrderService.restoreJobOrder(joId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to restore job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { restoreJobOrder, loading, error };
};
