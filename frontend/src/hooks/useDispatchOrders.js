import { useState, useEffect, useCallback } from 'react';
import * as dispatchOrderService from '../services/dispatchOrderService.js';

export const useDispatchOrders = (params = {}) => {
    const [dispatchOrders, setDispatchOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState(null);

    const paramsKey = JSON.stringify(params);

    const fetchDispatchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [data, statsData] = await Promise.all([
                dispatchOrderService.getDispatchOrders(params),
                dispatchOrderService.getDispatchStats()
            ]);

            // Backend returns { dispatchOrders: [...], pagination: {...} }
            const orders = data?.dispatchOrders || data?.rows || (Array.isArray(data) ? data : []);
            setDispatchOrders(orders);
            setPagination(data?.pagination || null);
            setStats(statsData);
        } catch (err) {
            setError(err.message || 'Failed to fetch dispatch orders');
        } finally {
            setLoading(false);
        }
    }, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchDispatchOrders();
    }, [fetchDispatchOrders]);

    return { dispatchOrders, stats, loading, error, pagination, refetch: fetchDispatchOrders };
};
