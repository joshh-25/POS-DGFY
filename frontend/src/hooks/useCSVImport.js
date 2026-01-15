import { useState } from 'react';
import api from '../services/api.js';

export const useCSVImport = () => {
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState(null);

    /**
     * Preview CSV content - validate and return preview data
     */
    const previewCSV = async (csvContent) => {
        setLoading(true);
        setError(null);
        setPreviewData(null);

        try {
            const response = await api.post('/items/import/preview', { csvContent });
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

    /**
     * Confirm and execute the import
     */
    const confirmImport = async (rows) => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.post('/items/import/confirm', { rows });
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to import';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Get template download URL for specific type
     * @param {string} type - 'items', 'products', or 'master'
     */
    const getTemplateUrl = (type = 'master') => {
        return `${api.defaults.baseURL}/items/import/template?type=${type}`;
    };

    /**
     * Download template directly
     * @param {string} type - 'items', 'products', or 'master'
     */
    const downloadTemplate = async (type = 'master') => {
        try {
            const response = await api.get(`/items/import/template?type=${type}`, {
                responseType: 'blob'
            });

            // Determine filename based on type
            let filename;
            switch (type) {
                case 'items':
                    filename = 'items_import_template.csv';
                    break;
                case 'products':
                    filename = 'products_import_template.csv';
                    break;
                default:
                    filename = 'item_import_template.csv';
            }

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            return { success: true };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to download template';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    /**
     * Reset state
     */
    const reset = () => {
        setPreviewData(null);
        setError(null);
    };

    return {
        loading,
        previewData,
        error,
        previewCSV,
        confirmImport,
        getTemplateUrl,
        downloadTemplate,
        reset
    };
};

export default useCSVImport;
