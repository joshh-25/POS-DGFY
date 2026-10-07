/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProcessingFeePolicyEditor from '../ProcessingFeePolicyEditor.jsx';
import { businessAdminApi } from '../businessAdminService.js';

vi.mock('../businessAdminService.js', () => ({
    businessAdminApi: {
        tenantRevenueFeeHistory: vi.fn(),
        saveTenantRevenueFeePolicy: vi.fn()
    },
    getBusinessAdminErrorMessage: (error) => error?.message || 'Request failed'
}));

const latestPolicy = {
    policy_id: 'policy-4',
    version: 4,
    effective_at: '2026-10-06T09:00:00.000Z',
    fallback_fee_policy: {
        card: { rate_bps: 250, fixed_centavos: 100 },
        ewallet: { rate_bps: 180, fixed_centavos: 50 },
        qrph: { rate_bps: 100, fixed_centavos: 25 },
        online_banking: { rate_bps: 150, fixed_centavos: 40 },
        other: { rate_bps: 0, fixed_centavos: 0 }
    },
    customer_processing_fee_policy: {
        mode: 'percentage',
        rate_bps: 300,
        fixed_centavos: 0,
        label: 'Processing fee'
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    businessAdminApi.tenantRevenueFeeHistory.mockResolvedValue({ policies: [latestPolicy] });
    businessAdminApi.saveTenantRevenueFeePolicy.mockResolvedValue({
        policy: { ...latestPolicy, policy_id: 'policy-5', version: 5 }
    });
});

afterEach(cleanup);

describe('ProcessingFeePolicyEditor', () => {
    it('edits only the item-preparation fee while preserving provider fallback values', async () => {
        render(<ProcessingFeePolicyEditor canEdit />);

        expect(await screen.findByText('Item preparation fee')).toBeTruthy();
        expect(screen.queryByLabelText('Card fallback rate')).toBeNull();
        expect(screen.queryByText('Payment provider fallback fees and item processing fee')).toBeNull();

        fireEvent.change(screen.getByRole('textbox', { name: 'Reason for change' }), {
            target: { value: 'Updated item preparation policy' }
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save preparation fee' }));

        await waitFor(() => expect(businessAdminApi.saveTenantRevenueFeePolicy).toHaveBeenCalledWith(expect.objectContaining({
            expected_policy_version: 4,
            fallback_fee_policy: latestPolicy.fallback_fee_policy,
            customer_processing_fee_policy: {
                mode: 'percentage',
                rate_bps: 300,
                fixed_centavos: 0,
                label: 'Processing fee'
            },
            reason: 'Updated item preparation policy'
        })));
    });
});
