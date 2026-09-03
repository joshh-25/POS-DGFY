import { useState } from 'react';
import api from '../services/api.js';
import {
    normalizeWorkflowMode,
    resolveWorkflowTemplateMode
} from '../features/settings/workflowMode.js';

const normalizeTemplateRequest = (input) => {
    if (typeof input === 'object' && input !== null) {
        return resolveWorkflowTemplateMode(input.workflowMode);
    }

    const normalized = String(input || '').trim().toLowerCase();

    // Legacy compatibility: old callers passed template type values.
    if (normalized === 'items' || normalized === 'products' || normalized === 'master') {
        return 'manufacturing';
    }

    return resolveWorkflowTemplateMode(normalizeWorkflowMode(normalized));
};

export const useCSVImport = () => {
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState(null);

    /**
     * Preview CSV content - validate and return preview data.
     *
     * `mode` (#1495 Part B) is 'append' (default, historical behaviour) or 'sync'. Sync additionally
     * returns the deactivation list -- items in the catalog whose SKU is absent from the file --
     * which confirmImport below must echo back; the server refuses a sync confirm without it.
     */
    const previewCSV = async (file, { mode = 'append' } = {}) => {
        setLoading(true);
        setError(null);
        setPreviewData(null);

        try {
            const csvContent = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const response = await api.post('/items/import/preview', { csvContent, mode });
            setPreviewData(response.data.data);
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to preview CSV';
            setError(errorMessage);
            return {
                success: false,
                error: errorMessage,
                details: err.response?.data?.errors || null
            };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Confirm and execute the import.
     *
     * In sync mode `deactivateSkus` is REQUIRED and must be the SKU list from the preview the user
     * actually saw. The server intersects it with its own freshly-derived absent set, so this list
     * can only ever narrow what gets deactivated, never widen it.
     */
    const confirmImport = async (rows, { mode = 'append', deactivateSkus } = {}) => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.post('/items/import/confirm', {
                rows,
                mode,
                ...(mode === 'sync' ? { deactivateSkus: deactivateSkus || [] } : {})
            });
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to import';
            setError(errorMessage);
            return {
                success: false,
                error: errorMessage,
                details: err.response?.data?.errors || null
            };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Get template download URL for specific type
     * @param {string|object} templateRequest - workflow mode or legacy template type
     */
    const getTemplateUrl = (templateRequest = 'manufacturing') => {
        const workflowMode = normalizeTemplateRequest(templateRequest);
        return `${api.defaults.baseURL}/items/import/template?workflow_mode=${workflowMode}`;
    };

    /**
     * Download template directly
     * @param {string|object} templateRequest - workflow mode or legacy template type
     */
    const downloadTemplate = async (templateRequest = 'manufacturing') => {
        try {
            const workflowMode = normalizeTemplateRequest(templateRequest);
            const response = await api.get(`/items/import/template?workflow_mode=${workflowMode}`, {
                responseType: 'blob'
            });

            const templateFilenames = {
                food_manufacturing: 'food_manufacturing_items_import_template.csv',
                manufacturing: 'food_manufacturing_items_import_template.csv',
                msme: 'msme_items_import_template.csv',
                services: 'services_items_import_template.csv',
                fnb: 'fnb_items_import_template.csv'
            };
            const filename = templateFilenames[workflowMode] || 'food_manufacturing_items_import_template.csv';

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            return { success: true, workflowMode };
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
