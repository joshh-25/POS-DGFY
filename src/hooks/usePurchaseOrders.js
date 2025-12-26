import { useState, useEffect, useCallback } from 'react';
import * as purchaseOrderService from '../services/purchaseOrderService.js';

export const usePurchaseOrders = (params = {}) => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrderService.getPurchaseOrders(params);
      // Handle both snake_case (purchase_orders) and camelCase (purchaseOrders) responses
      const orders = data.purchase_orders || data.purchaseOrders || (Array.isArray(data) ? data : []);
      setPurchaseOrders(orders);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  return { purchaseOrders, loading, error, pagination, refetch: fetchPurchaseOrders };
};

export const usePurchaseOrderById = (poId) => {
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPurchaseOrder = useCallback(async () => {
    if (!poId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrderService.getPurchaseOrderById(poId);
      setPurchaseOrder(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch purchase order');
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    fetchPurchaseOrder();
  }, [fetchPurchaseOrder]);

  return { purchaseOrder, loading, error, refetch: fetchPurchaseOrder };
};

export const useCreatePurchaseOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPurchaseOrder = useCallback(async (poData) => {
    setLoading(true);
    setError(null);
    try {
      const purchaseOrder = await purchaseOrderService.createPurchaseOrder(poData);
      return purchaseOrder;
    } catch (err) {
      setError(err.message || 'Failed to create purchase order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createPurchaseOrder, loading, error };
};

export const useReceivePurchaseOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const receivePurchaseOrder = useCallback(async (poId, receiptData) => {
    setLoading(true);
    setError(null);
    try {
      const purchaseOrder = await purchaseOrderService.receivePurchaseOrder(poId, receiptData);
      return purchaseOrder;
    } catch (err) {
      setError(err.message || 'Failed to receive purchase order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { receivePurchaseOrder, loading, error };
};

