import { useState, useCallback } from 'react';
import api from '../services/api';

/**
 * Hook for fetching comprehensive report data
 */
export const useReports = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expiryReport, setExpiryReport] = useState(null);
    const [stockAgingReport, setStockAgingReport] = useState(null);
    const [productionReport, setProductionReport] = useState(null);
    const [poAnalysisReport, setPoAnalysisReport] = useState(null);
    const [executiveSummary, setExecutiveSummary] = useState(null);
    const [complianceBooksPackage, setComplianceBooksPackage] = useState(null);
    const [snapshots, setSnapshots] = useState([]);

    // Build query string from filters
    const buildQuery = (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        return params.toString();
    };

    // Fetch Expiry Report
    const fetchExpiryReport = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/expiry${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setExpiryReport(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching expiry report:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch Enhanced Stock Aging Report
    const fetchStockAgingReport = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/stock-aging-enhanced${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setStockAgingReport(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching stock aging report:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch Production Report
    const fetchProductionReport = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/production${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setProductionReport(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching production report:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch PO Analysis Report
    const fetchPOAnalysisReport = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/po-analysis${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setPoAnalysisReport(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching PO analysis report:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch Executive Summary
    const fetchExecutiveSummary = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/executive-summary${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setExecutiveSummary(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching executive summary:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch compliance books package (Sales Journal / Purchase Journal / Inventory Book)
    const fetchComplianceBooksPackage = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/compliance-package${query ? `?${query}` : ''}`);
            if (response.data.success) {
                setComplianceBooksPackage(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || err.message);
            console.error('Error fetching compliance books package:', err);
        } finally {
            setLoading(false);
        }
        return null;
    }, []);

    // Fetch Snapshots
    const fetchSnapshots = useCallback(async (reportType, limit = 20) => {
        try {
            const response = await api.get(`/reports/snapshots?type=${reportType}&limit=${limit}`);
            if (response.data.success) {
                setSnapshots(response.data.data.snapshots);
                return response.data.data.snapshots;
            }
        } catch (err) {
            console.error('Error fetching snapshots:', err);
        }
        return [];
    }, []);

    // Save Snapshot
    const saveSnapshot = useCallback(async (reportType, snapshotData, dateRange = {}, reportName = null) => {
        try {
            const response = await api.post('/reports/snapshots', {
                reportType,
                snapshotData,
                dateRange,
                reportName
            });
            if (response.data.success) {
                return response.data.data;
            }
        } catch (err) {
            console.error('Error saving snapshot:', err);
            throw err;
        }
        return null;
    }, []);

    // Load Snapshot by ID
    const loadSnapshot = useCallback(async (snapshotId) => {
        try {
            const response = await api.get(`/reports/snapshots/${snapshotId}`);
            if (response.data.success) {
                return response.data.data;
            }
        } catch (err) {
            console.error('Error loading snapshot:', err);
        }
        return null;
    }, []);

    // Export Report as CSV
    const exportCSV = useCallback(async (reportType, filters = {}) => {
        try {
            const query = buildQuery(filters);
            const response = await api.get(`/reports/export?type=${reportType}${query ? `&${query}` : ''}`, {
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // Extract filename from Content-Disposition header or use default
            const contentDisposition = response.headers['content-disposition'];
            let filename = `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch) filename = filenameMatch[1];
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            return true;
        } catch (err) {
            console.error('Error exporting CSV:', err);
            throw err;
        }
    }, []);

    return {
        loading,
        error,
        expiryReport,
        stockAgingReport,
        productionReport,
        poAnalysisReport,
        executiveSummary,
        complianceBooksPackage,
        snapshots,
        fetchExpiryReport,
        fetchStockAgingReport,
        fetchProductionReport,
        fetchPOAnalysisReport,
        fetchExecutiveSummary,
        fetchComplianceBooksPackage,
        fetchSnapshots,
        saveSnapshot,
        loadSnapshot,
        exportCSV
    };
};

export default useReports;
