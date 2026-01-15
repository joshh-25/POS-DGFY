import { useState } from 'react';
import api from '../services/api.js';

export const useCSVExport = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Export all items (will return ZIP if both items and products exist)
     */
    const exportAll = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.get('/items/export/all', {
                responseType: 'blob'
            });

            // Trigger download
            downloadBlob(response.data, getFilename(response));

            return { success: true };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to export items';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Export items with filters
     */
    const exportFiltered = async (filters = {}) => {
        setLoading(true);
        setError(null);

        try {
            // Build query params
            const params = new URLSearchParams();
            if (filters.category && filters.category !== 'all') {
                params.append('category', filters.category);
            }
            if (filters.search) {
                params.append('search', filters.search);
            }
            if (filters.fifo && filters.fifo !== 'all') {
                params.append('fifo', filters.fifo);
            }
            if (filters.folder && filters.folder !== 'all') {
                params.append('folder', filters.folder);
            }

            const queryString = params.toString();
            const url = `/items/export${queryString ? `?${queryString}` : ''}`;

            const response = await api.get(url, {
                responseType: 'blob'
            });

            // Trigger download
            downloadBlob(response.data, getFilename(response));

            return { success: true };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to export items';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Export specific items by IDs
     */
    const exportByIds = async (itemIds) => {
        setLoading(true);
        setError(null);

        try {
            if (!itemIds || itemIds.length === 0) {
                throw new Error('No items selected for export');
            }

            const response = await api.post('/items/export', { itemIds }, {
                responseType: 'blob'
            });

            // Trigger download
            downloadBlob(response.data, getFilename(response));

            return { success: true };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to export items';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    /**
     * Get export preview count
     */
    const getExportPreview = async (filters = {}) => {
        try {
            const params = new URLSearchParams();
            if (filters.category && filters.category !== 'all') {
                params.append('category', filters.category);
            }
            if (filters.search) {
                params.append('search', filters.search);
            }
            if (filters.fifo && filters.fifo !== 'all') {
                params.append('fifo', filters.fifo);
            }
            if (filters.folder && filters.folder !== 'all') {
                params.append('folder', filters.folder);
            }

            const queryString = params.toString();
            const url = `/items/export/preview${queryString ? `?${queryString}` : ''}`;

            const response = await api.get(url);
            return {
                success: true,
                count: response.data.data.count,
                isZip: response.data.data.isZip || false,
                itemsCount: response.data.data.itemsCount,
                productsCount: response.data.data.productsCount
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    /**
     * Helper: Download blob as file
     */
    const downloadBlob = (blob, filename) => {
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    /**
     * Helper: Extract filename from response headers or generate default
     * Handles both CSV and ZIP file types
     */
    const getFilename = (response) => {
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            // Try multiple regex patterns for different Content-Disposition formats
            // Pattern 1: filename="quoted_value"
            // Pattern 2: filename=unquoted_value
            // Pattern 3: filename*=UTF-8''encoded_value
            let filename = null;

            // Try quoted filename first
            const quotedMatch = contentDisposition.match(/filename="([^"]+)"/);
            if (quotedMatch) {
                filename = quotedMatch[1];
            } else {
                // Try unquoted filename
                const unquotedMatch = contentDisposition.match(/filename=([^;\s]+)/);
                if (unquotedMatch) {
                    filename = unquotedMatch[1];
                }
            }

            if (filename) {
                // Trim whitespace and remove any trailing non-extension characters
                filename = filename.trim();
                // Ensure filename ends with proper extension (remove trailing garbage)
                if (filename.match(/\.(zip|csv)$/i)) {
                    return filename;
                }
                // If extension looks corrupted, fix it based on content-type
                if (filename.match(/\.(zip|csv)/i)) {
                    const extMatch = filename.match(/\.(zip|csv)/i);
                    const extension = extMatch[1].toLowerCase();
                    const baseName = filename.substring(0, extMatch.index);
                    return `${baseName}.${extension}`;
                }
            }
        }

        // Determine extension from content type
        const contentType = response.headers['content-type'];
        const timestamp = new Date().toISOString().split('T')[0];

        if (contentType && contentType.includes('application/zip')) {
            return `inventory_export_${timestamp}.zip`;
        }

        return `items_export_${timestamp}.csv`;
    };

    /**
     * Reset state
     */
    const reset = () => {
        setError(null);
    };

    return {
        loading,
        error,
        exportAll,
        exportFiltered,
        exportByIds,
        getExportPreview,
        reset
    };
};

export default useCSVExport;
