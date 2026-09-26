import { useState, useCallback, useRef } from 'react';
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
    const reportRequestRef = useRef(0);

    // Build query string from filters
    const buildQuery = (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.location_id) params.append('location_id', String(filters.location_id));
        return params.toString();
    };

    const executeReportRequest = useCallback(async ({ endpoint, filters, onSuccess, logMessage }) => {
        const requestId = reportRequestRef.current + 1;
        reportRequestRef.current = requestId;
        setLoading(true);
        setError(null);

        try {
            const query = buildQuery(filters);
            const response = await api.get(`${endpoint}${query ? `?${query}` : ''}`);
            if (response.data.success && reportRequestRef.current === requestId) {
                onSuccess(response.data.data);
                return response.data.data;
            }
        } catch (err) {
            if (reportRequestRef.current === requestId) {
                setError(err.response?.data?.error || err.response?.data?.message || err.message);
                console.error(logMessage, err);
            }
        } finally {
            if (reportRequestRef.current === requestId) setLoading(false);
        }
        return null;
    }, []);

    // Fetch Expiry Report
    const fetchExpiryReport = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/expiry',
        filters,
        onSuccess: setExpiryReport,
        logMessage: 'Error fetching expiry report:'
    }), [executeReportRequest]);

    // Fetch Enhanced Stock Aging Report
    const fetchStockAgingReport = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/stock-aging-enhanced',
        filters,
        onSuccess: setStockAgingReport,
        logMessage: 'Error fetching stock aging report:'
    }), [executeReportRequest]);

    // Fetch Production Report
    const fetchProductionReport = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/production',
        filters,
        onSuccess: setProductionReport,
        logMessage: 'Error fetching production report:'
    }), [executeReportRequest]);

    // Fetch PO Analysis Report
    const fetchPOAnalysisReport = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/po-analysis',
        filters,
        onSuccess: setPoAnalysisReport,
        logMessage: 'Error fetching PO analysis report:'
    }), [executeReportRequest]);

    // Fetch Executive Summary
    const fetchExecutiveSummary = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/executive-summary',
        filters,
        onSuccess: setExecutiveSummary,
        logMessage: 'Error fetching executive summary:'
    }), [executeReportRequest]);

    // Fetch compliance books package (Sales Journal / Purchase Journal / Inventory Book)
    const fetchComplianceBooksPackage = useCallback((filters = {}) => executeReportRequest({
        endpoint: '/reports/compliance-package',
        filters,
        onSuccess: setComplianceBooksPackage,
        logMessage: 'Error fetching compliance books package:'
    }), [executeReportRequest]);

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
