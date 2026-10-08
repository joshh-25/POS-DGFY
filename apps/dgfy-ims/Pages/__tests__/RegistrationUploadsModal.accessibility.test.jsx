/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const adminServiceMock = vi.hoisted(() => ({
    listCompanyRegistrationUploads: vi.fn(),
    downloadCompanyRegistrationUpload: vi.fn(),
    downloadCompanyRegistrationMenuArchive: vi.fn(),
    approveCompanyRegistrationDraft: vi.fn(),
    retryCompanyRegistrationDraftMaterialization: vi.fn()
}));

vi.mock('@/services/adminService', () => adminServiceMock);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import RegistrationUploadsModal from '../admin/RegistrationUploadsModal.jsx';

const subject = {
    type: 'draft',
    id: 'draft-1',
    payload: { business: { company_name: 'Example Cafe' } },
    status: 'pending_review'
};

describe('RegistrationUploadsModal accessibility behavior', () => {
    beforeEach(() => {
        adminServiceMock.listCompanyRegistrationUploads.mockReset();
        adminServiceMock.listCompanyRegistrationUploads.mockResolvedValue({
            data: {
                draft: { ...subject, submitted_at: '2026-09-26T00:00:00.000Z' },
                uploads: [{
                    id: 'upload-1',
                    category: 'menu_upload',
                    original_name: 'menu.csv',
                    sanitized_name: 'menu.csv',
                    mime_type: 'text/csv',
                    file_size: 128,
                    upload_status: 'ready_for_review',
                    extraction_status: 'pending',
                    uploaded_at: '2026-09-26T00:00:00.000Z'
                }]
            }
        });
    });

    afterEach(() => cleanup());

    it('captures focus, traps keyboard navigation, handles Escape, and restores focus', async () => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.textContent = 'Review files';
        document.body.appendChild(trigger);
        trigger.focus();

        const onClose = vi.fn();
        const { unmount } = render(<RegistrationUploadsModal subject={subject} onClose={onClose} />);
        const dialog = await screen.findByRole('dialog', { name: /example cafe/i });
        const closeButton = screen.getByRole('button', { name: 'Close registration review' });
        const footerCloseButton = screen.getByRole('button', { name: 'Close', exact: true });

        expect(dialog.getAttribute('aria-describedby')).toBe('registration-uploads-description');
        expect(screen.getByRole('table').querySelector('caption')?.textContent).toBe('Submitted registration upload details');
        expect(document.activeElement).toBe(closeButton);

        footerCloseButton.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(closeButton);

        closeButton.focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(footerCloseButton);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        trigger.remove();
    });
});
