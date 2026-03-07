import { useState } from 'react';
import api from '../services/api.js';

export const useSupplierCSV = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [previewData, setPreviewData] = useState(null);

    // --- EXPORT FUNCTIONS ---

    const exportSuppliers = async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filters.search) params.append('search', filters.search);
            if (filters.status && filters.status !== 'all') params.append('status', filters.status);
            if (filters.ids && Array.isArray(filters.ids) && filters.ids.length > 0) {
                params.append('ids', filters.ids.join(','));
            }

            const queryString = params.toString();
            const url = `/suppliers/export${queryString ? `?${queryString}` : ''}`;

            const response = await api.get(url, { responseType: 'blob' });

            // Trigger download
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;

            // Get filename from header or default
            const contentDisposition = response.headers['content-disposition'];
            let filename = `suppliers_export_${new Date().toISOString().split('T')[0]}.csv`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) filename = match[1];
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);

            return { success: true };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to export suppliers';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    // --- IMPORT FUNCTIONS ---

    const downloadTemplate = async () => {
        try {
            const response = await api.get('/suppliers/import/template', { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'suppliers_import_template.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Failed to download template' };
        }
    };

    const previewCSV = async (file) => {
        setLoading(true);
        setError(null);
        setPreviewData(null);
        try {
            const csvContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const response = await api.post('/suppliers/import/preview', { csvContent });
            setPreviewData(response.data.data);
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to preview CSV';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    const confirmImport = async (rows) => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/suppliers/import/confirm', { rows });
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to confirm import';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setError(null);
        setPreviewData(null);
    };

    return {
        loading,
        error,
        previewData,
        exportSuppliers,
        downloadTemplate,
        previewCSV,
        confirmImport,
        reset
    };
};

export default useSupplierCSV;
