import { useState, useEffect, useCallback } from 'react';
import * as supplierService from '../services/supplierService.js';

export const useSuppliers = (params = {}) => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supplierService.getSuppliers(params);
      setSuppliers(data.suppliers || data || []);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return { suppliers, loading, error, pagination, refetch: fetchSuppliers };
};

export const useSupplierById = (supplierId) => {
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSupplier = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await supplierService.getSupplierById(supplierId);
      setSupplier(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch supplier');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    fetchSupplier();
  }, [fetchSupplier]);

  return { supplier, loading, error, refetch: fetchSupplier };
};

export const useCreateSupplier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createSupplier = useCallback(async (supplierData) => {
    setLoading(true);
    setError(null);
    try {
      const supplier = await supplierService.createSupplier(supplierData);
      return supplier;
    } catch (err) {
      setError(err.message || 'Failed to create supplier');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createSupplier, loading, error };
};

export const useUpdateSupplier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateSupplier = useCallback(async (supplierId, supplierData) => {
    setLoading(true);
    setError(null);
    try {
      const supplier = await supplierService.updateSupplier(supplierId, supplierData);
      return supplier;
    } catch (err) {
      setError(err.message || 'Failed to update supplier');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateSupplier, loading, error };
};

export const useCreateSupplierDraft = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createSupplierDraft = useCallback(async (supplierData) => {
    setLoading(true);
    setError(null);
    try {
      const supplier = await supplierService.createSupplierDraft(supplierData);
      return supplier;
    } catch (err) {
      setError(err.message || 'Failed to save supplier draft');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createSupplierDraft, loading, error };
};

export const useFinalizeSupplier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const finalizeSupplier = useCallback(async (supplierId) => {
    setLoading(true);
    setError(null);
    try {
      const supplier = await supplierService.finalizeSupplier(supplierId);
      return supplier;
    } catch (err) {
      setError(err.message || 'Failed to finalize supplier');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { finalizeSupplier, loading, error };
};

export const useDeleteSupplier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const deleteSupplier = useCallback(async (supplierId) => {
    setLoading(true);
    setError(null);
    try {
      await supplierService.deleteSupplier(supplierId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete supplier');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteSupplier, loading, error };
};
