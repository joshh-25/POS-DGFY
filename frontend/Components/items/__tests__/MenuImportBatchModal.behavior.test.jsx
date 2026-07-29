/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TERMINAL_STATUSES = ['completed', 'completed_with_errors', 'failed'];

const createMenuImportJob = vi.fn();
const getMenuImportJob = vi.fn();
const previewMenuImportJob = vi.fn();
const confirmMenuImport = vi.fn();

vi.mock('../../../src/services/menuImportService.js', () => ({
    createMenuImportJob: (...args) => createMenuImportJob(...args),
    getMenuImportJob: (...args) => getMenuImportJob(...args),
    previewMenuImportJob: (...args) => previewMenuImportJob(...args),
    confirmMenuImport: (...args) => confirmMenuImport(...args),
    isMenuImportTerminalStatus: (status) => TERMINAL_STATUSES.includes(status),
    isMenuImportBatchEnabled: () => true,
    MENU_IMPORT_MAX_FILES_HINT: 20,
    MENU_IMPORT_ACCEPTED_FILE_PATTERN: /\.(pdf|png|jpe?g)$/i,
    MENU_IMPORT_FILE_ACCEPT_ATTRIBUTE: '.pdf,.png,.jpg,.jpeg'
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() }
}));

// The capture sheet's camera behavior is covered by its own test; here we only
// care that a captured frame joins the same staged-file list the picker feeds.
vi.mock('../MenuPhotoCaptureSheet.jsx', () => ({
    default: ({ onAddFiles, remainingSlots }) => (
        <button
            type="button"
            onClick={() => onAddFiles([new File(['jpeg'], 'menu-photo-1.jpg', { type: 'image/jpeg' })])}
        >
            {`stub-capture (${remainingSlots} slots)`}
        </button>
    ),
    supportsMenuPhotoCapture: () => true
}));

const { default: MenuImportBatchModal } = await import('../MenuImportBatchModal.jsx');

const stageFiles = (files) => {
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files } });
};

const completedJob = {
    job_id: 'job-1',
    status: 'completed_with_errors',
    totals: { files: 3, completed: 2, failed: 1, pending: 0 },
    files: [
        { file_id: 'f1', original_name: 'menu-a.jpg', status: 'completed', item_count: 2, kind: 'image' },
        {
            file_id: 'f2',
            original_name: 'scan.pdf',
            status: 'completed',
            item_count: 1,
            kind: 'pdf_rasterized',
            pages: 15,
            pages_total: 22,
            truncated: true
        },
        { file_id: 'f3', original_name: 'blurry.png', status: 'failed', error_message: 'No menu items were found.' }
    ]
};

const previewPayload = {
    totalRows: 2,
    validRows: 2,
    invalidRows: 0,
    rows: [
        {
            rowNumber: 1,
            valid: true,
            data: { name: 'Adobo', default_sale_price: '180.00', product_folder: 'Mains' },
            price_conflict: true,
            observed_prices: [180, 185]
        },
        {
            rowNumber: 2,
            valid: true,
            data: { name: 'Halo-Halo', default_sale_price: '120.00', product_folder: 'Desserts' }
        }
    ],
    merge: {
        files_considered: 2,
        files_excluded: 1,
        items_before_dedup: 3,
        items_after_dedup: 2,
        conflicts: [{ name: 'Adobo', chosen_price: 180, observed_prices: [180, 185], index: 0 }],
        near_duplicates: [{ name_a: 'Halo-Halo', name_b: 'Halo Halo', price: 120, index_a: 1, index_b: 2 }]
    }
};

describe('MenuImportBatchModal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        createMenuImportJob.mockReset();
        getMenuImportJob.mockReset();
        previewMenuImportJob.mockReset();
        confirmMenuImport.mockReset();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    const runToReviewStep = async () => {
        createMenuImportJob.mockResolvedValue({ job_id: 'job-1', total_files: 3 });
        getMenuImportJob.mockResolvedValue(completedJob);
        previewMenuImportJob.mockResolvedValue(previewPayload);

        render(<MenuImportBatchModal open onClose={() => {}} onSuccess={() => {}} />);

        stageFiles([
            new File(['a'], 'menu-a.jpg', { type: 'image/jpeg' }),
            new File(['b'], 'scan.pdf', { type: 'application/pdf' }),
            new File(['c'], 'blurry.png', { type: 'image/png' })
        ]);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Extract Items \(3\)/ }));
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    };

    it('stages a captured photo alongside picked files and uploads them together', async () => {
        createMenuImportJob.mockResolvedValue({ job_id: 'job-1', total_files: 2 });
        getMenuImportJob.mockResolvedValue(completedJob);
        previewMenuImportJob.mockResolvedValue(previewPayload);

        render(<MenuImportBatchModal open onClose={() => {}} onSuccess={() => {}} />);

        stageFiles([new File(['a'], 'menu-a.jpg', { type: 'image/jpeg' })]);

        fireEvent.click(screen.getByRole('button', { name: /Take Photos/ }));
        // The sheet is offered the batch's unused slots, not the raw cap.
        fireEvent.click(screen.getByRole('button', { name: /stub-capture \(19 slots\)/ }));

        expect(screen.getByText('menu-photo-1.jpg')).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Extract Items \(2\)/ }));
        });

        expect(createMenuImportJob.mock.calls[0][0].map((file) => file.name))
            .toEqual(['menu-a.jpg', 'menu-photo-1.jpg']);
    });

    it('accepts several files and uploads them as one job', async () => {
        await runToReviewStep();

        expect(createMenuImportJob).toHaveBeenCalledTimes(1);
        expect(createMenuImportJob.mock.calls[0][0]).toHaveLength(3);
    });

    it('surfaces price conflicts, near duplicates, truncated scans, and unreadable files on review', async () => {
        await runToReviewStep();

        // Merge summary
        expect(screen.getByText(/extracted item\(s\) from/)).toBeTruthy();
        expect(screen.getByText(/1 file\(s\) could not be read\./)).toBeTruthy();

        // Price conflict — banner, per-row badge, and the other observed price
        expect(screen.getByText('1 item(s) had different prices across files')).toBeTruthy();
        expect(screen.getByText('Price conflict')).toBeTruthy();
        expect(screen.getByText(/Also seen at .*185\.00/)).toBeTruthy();

        // Near duplicates are flagged, never auto-merged
        expect(screen.getByText(/“Halo-Halo” and “Halo Halo”/)).toBeTruthy();

        // Phase 3 truncation is visible with both page counts
        expect(screen.getByText(/scan\.pdf — first 15 of 22 page\(s\)/)).toBeTruthy();

        // Failed file, with the server's reason
        expect(screen.getByText(/blurry\.png — No menu items were found\./)).toBeTruthy();
    });

    it('confirms only the rows still selected', async () => {
        confirmMenuImport.mockResolvedValue({ createdCount: 1, failedCount: 0, results: { failed: [] } });
        await runToReviewStep();

        fireEvent.click(screen.getByLabelText('Import Halo-Halo'));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Confirm Import \(1 items\)/ }));
        });

        expect(confirmMenuImport).toHaveBeenCalledTimes(1);
        const submittedRows = confirmMenuImport.mock.calls[0][0];
        expect(submittedRows).toHaveLength(1);
        expect(submittedRows[0].data.name).toBe('Adobo');
        expect(screen.getByText('Import Complete!')).toBeTruthy();
    });
});
