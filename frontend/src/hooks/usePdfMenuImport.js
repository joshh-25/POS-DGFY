import { useState } from 'react';
import api from '../services/api.js';

/**
 * @deprecated Superseded by `useMenuImportJob` + `menuImportService.js`, which
 * handle several files per import, scanned PDFs, camera capture, and merge
 * review. Kept because the batch path hard-requires Redis and this one does
 * not, so it remains the fallback where the batch worker is unavailable. Do
 * not extend it; see ADR 0039's removal criteria before deleting it.
 *
 * PDF menu import hook — mirrors useCSVImport.js's preview/confirm shape.
 * Preview uploads the PDF (multipart) for server-side LLM extraction and
 * returns the same preview row shape CSV import returns; confirm reuses the
 * exact same /items/import/confirm-style persistence endpoint.
 *
 * Quick/temporary feature — gated by VITE_MENU_PDF_IMPORT_ENABLED, default OFF.
 */
export const isPdfMenuImportEnabled = () => import.meta.env.VITE_MENU_PDF_IMPORT_ENABLED === 'true';

export const usePdfMenuImport = () => {
    const [loading, setLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState(null);

    /**
     * Upload a PDF for extraction + preview.
     */
    const previewPdf = async (file) => {
        setLoading(true);
        setError(null);
        setPreviewData(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post('/items/import/pdf/preview', formData);
            setPreviewData(response.data.data);
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to extract items from PDF';
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
     * Confirm and execute the import for the (possibly edited) preview rows.
     */
    const confirmImport = async (rows) => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.post('/items/import/pdf/confirm', { rows });
            return { success: true, data: response.data.data };
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'Failed to import menu items';
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

    const reset = () => {
        setPreviewData(null);
        setError(null);
    };

    return {
        loading,
        previewData,
        error,
        previewPdf,
        confirmImport,
        reset
    };
};

export default usePdfMenuImport;
