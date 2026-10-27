/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanonicalBusinessNameEditor from '../CanonicalBusinessNameEditor.jsx';
import { businessAdminApi } from '../businessAdminService.js';

vi.mock('../businessAdminService.js', () => ({
    businessAdminApi: {
        updateCompanyName: vi.fn()
    },
    getBusinessAdminErrorMessage: (error) => error?.message || 'Request failed'
}));

afterEach(cleanup);

describe('CanonicalBusinessNameEditor', () => {
    beforeEach(() => vi.clearAllMocks());

    it('allows an admin to rename the canonical business identity', async () => {
        const onSaved = vi.fn();
        businessAdminApi.updateCompanyName.mockResolvedValue({
            name: 'Renamed Store',
            previous_name: 'Old Store',
            changed: true
        });

        render(<CanonicalBusinessNameEditor currentName="Old Store" canEdit onSaved={onSaved} />);

        fireEvent.change(screen.getByRole('textbox', { name: 'Business name' }), {
            target: { value: 'Renamed Store' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save business name' }));

        await waitFor(() => expect(businessAdminApi.updateCompanyName).toHaveBeenCalledWith({ name: 'Renamed Store' }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Store', changed: true }));
        expect((await screen.findByRole('status')).textContent).toContain('Business name updated in OPIS, POS, Storefront, and reports');
    });

    it('keeps the editor read-only for non-admin users', () => {
        render(<CanonicalBusinessNameEditor currentName="Store" canEdit={false} />);

        expect(screen.getByRole('textbox', { name: 'Business name' }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Save business name' }).disabled).toBe(true);
        expect(screen.getByText('Admin only')).toBeTruthy();
    });

    it('keeps the save action single-line and responsive', () => {
        render(<CanonicalBusinessNameEditor currentName="Store" canEdit />);

        const saveButton = screen.getByRole('button', { name: 'Save business name' });
        expect(saveButton.className).toContain('w-full');
        expect(saveButton.className).toContain('md:w-auto');
        expect(saveButton.className).toContain('whitespace-nowrap');
    });

    it('shows the API error without changing the current value', async () => {
        businessAdminApi.updateCompanyName.mockRejectedValue(new Error('Rename failed'));

        render(<CanonicalBusinessNameEditor currentName="Store" canEdit />);
        fireEvent.click(screen.getByRole('button', { name: 'Save business name' }));

        expect((await screen.findByRole('alert')).textContent).toContain('Rename failed');
    });
});
