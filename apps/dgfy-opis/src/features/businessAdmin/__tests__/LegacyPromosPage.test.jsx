// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyPromosPage from '../LegacyPromosPage.jsx';

const legacyPromosMock = vi.hoisted(() => vi.fn());
const revokeLegacyPromoMock = vi.hoisted(() => vi.fn());
const canMock = vi.hoisted(() => vi.fn());

vi.mock('../businessAdminService.js', () => ({
    businessAdminApi: {
        legacyPromos: legacyPromosMock,
        revokeLegacyPromo: revokeLegacyPromoMock
    },
    getBusinessAdminErrorMessage: (error) => (
        error?.response?.data?.message || error?.message || 'Back Office could not load this workspace.'
    )
}));

vi.mock('@/hooks/usePermission', () => ({
    usePermission: () => ({ can: canMock })
}));

const PROMOS = [
    {
        source_key: 'storefront_promos',
        source_index: 0,
        promo_id: 'p1',
        promo_code: 'SAVE10',
        title: '10% off',
        discount_percent: 10,
        valid_from: '',
        valid_until: '',
        valid_time_start: '',
        valid_time_end: '',
        usage_limit: 10,
        used_count: 10,
        active: true,
        revoked: false,
        revoked_by: null,
        revoked_at: null,
        effective_state: 'exhausted'
    },
    {
        source_key: 'storefront_promo',
        source_index: null,
        promo_id: null,
        promo_code: 'LEGACY30',
        title: 'Legacy offer',
        discount_percent: 30,
        valid_from: '2026-09-01',
        valid_until: '2026-12-31',
        valid_time_start: '',
        valid_time_end: '',
        usage_limit: null,
        used_count: 3,
        active: true,
        revoked: false,
        revoked_by: null,
        revoked_at: null,
        effective_state: 'available'
    },
    {
        source_key: 'storefront_promos',
        source_index: 1,
        promo_id: 'p2',
        promo_code: 'GONE20',
        title: 'Revoked offer',
        discount_percent: 20,
        valid_from: '',
        valid_until: '',
        valid_time_start: '',
        valid_time_end: '',
        usage_limit: 50,
        used_count: 4,
        active: true,
        revoked: true,
        revoked_by: 'owner',
        revoked_at: '2026-09-30T00:00:00.000Z',
        effective_state: 'revoked'
    }
];

const renderPage = () => render(<LegacyPromosPage />);

describe('LegacyPromosPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canMock.mockReturnValue(true);
        legacyPromosMock.mockResolvedValue({ promos: PROMOS, timezone: 'Asia/Manila' });
        revokeLegacyPromoMock.mockResolvedValue({ promo: { ...PROMOS[1], revoked: true }, idempotent_replay: false });
    });

    afterEach(() => cleanup());

    it('lists source, code, discount, usage, and effective state for both setting keys', async () => {
        renderPage();

        expect(await screen.findByText('SAVE10')).toBeTruthy();
        expect(screen.getAllByText('Plural (configured)')).toHaveLength(2);
        expect(screen.getByText('Singular (compatibility)')).toBeTruthy();
        expect(screen.getByText('10%')).toBeTruthy();
        expect(screen.getByText('10 / 10')).toBeTruthy();
        expect(screen.getByText('Exhausted')).toBeTruthy();
        expect(screen.getByText('Available')).toBeTruthy();
        expect(screen.getByText('Revoked')).toBeTruthy();
        expect(screen.getByText('owner • 2026-09-30T00:00:00.000Z')).toBeTruthy();
    });

    it('offers no create, edit, reset, or reactivate controls anywhere', async () => {
        renderPage();
        await screen.findByText('SAVE10');

        expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /reactivate/i })).toBeNull();
        // Only the available entry exposes Revoke; exhausted/revoked rows are not revocable.
        expect(screen.getAllByRole('button', { name: /^Revoke / })).toHaveLength(1);
    });

    it('hides revoke controls from an operator without vouchers:manage', async () => {
        canMock.mockReturnValue(false);
        renderPage();
        await screen.findByText('SAVE10');

        expect(screen.queryByRole('button', { name: /^Revoke / })).toBeNull();
        expect(screen.getAllByText('Requires vouchers:manage').length).toBeGreaterThan(0);
    });

    it('revokes through the confirmation dialog with the stable identity payload', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke LEGACY30' }));

        expect(screen.getByRole('dialog', { name: 'Revoke legacy promo' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Revoke code' }));

        await waitFor(() => expect(revokeLegacyPromoMock).toHaveBeenCalledWith({
            source_key: 'storefront_promo',
            promo_code: 'LEGACY30'
        }));
        await waitFor(() => expect(legacyPromosMock).toHaveBeenCalledTimes(2));
    });

    it('surfaces a server denial inside the dialog without closing it', async () => {
        revokeLegacyPromoMock.mockRejectedValue({
            response: { status: 409, data: { message: 'Multiple legacy promo entries share this code; retry with promo_id or source_index.' } }
        });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Revoke LEGACY30' }));
        fireEvent.click(screen.getByRole('button', { name: 'Revoke code' }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('Multiple legacy promo entries share this code');
        expect(screen.getByRole('dialog', { name: 'Revoke legacy promo' })).toBeTruthy();
    });

    it('renders an access-denied state when the list request is forbidden', async () => {
        legacyPromosMock.mockRejectedValue({ response: { status: 403 } });
        renderPage();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('does not have permission');
    });
});
