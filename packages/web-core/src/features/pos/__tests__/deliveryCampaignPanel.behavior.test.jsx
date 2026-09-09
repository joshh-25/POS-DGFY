/** @vitest-environment jsdom */
// #1334/Phase 245: delivery-campaign authoring UI, added to VoucherManagementPanel.jsx (#614).
// Mirrors AffiliatesWorkspacePanel.behavior.test.jsx's shape: full-component render + userEvent,
// every named service export stubbed via vi.mock.

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VoucherManagementPanel from '../components/VoucherManagementPanel.jsx';

const listVouchers = vi.fn();
const getVoucher = vi.fn();
const createVoucher = vi.fn();
const updateVoucher = vi.fn();

vi.mock('@/services/voucherService.js', () => ({
    listVouchers: (...args) => listVouchers(...args),
    getVoucher: (...args) => getVoucher(...args),
    createVoucher: (...args) => createVoucher(...args),
    updateVoucher: (...args) => updateVoucher(...args),
    activateVoucher: vi.fn(),
    pauseVoucher: vi.fn(),
    archiveVoucher: vi.fn()
}));

vi.mock('@/services/itemService.js', () => ({
    getFolders: vi.fn().mockResolvedValue([]),
    getItems: vi.fn().mockResolvedValue({ items: [] })
}));

vi.mock('@/services/pricelistService.js', () => ({
    listPricelists: vi.fn().mockResolvedValue({ pricelists: [] })
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        error: (...args) => toastError(...args),
        success: (...args) => toastSuccess(...args),
        warning: (...args) => toastWarning(...args)
    }
}));

const emptyList = { vouchers: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };

// Not wrapped by their <Label> (no htmlFor/id pairing in this file) -- the Label and its field are
// siblings under one wrapping div. Finds the field the same way a sighted user would: by the text
// immediately next to it.
const getFieldByLabel = (labelText) => {
    const label = Array.from(document.querySelectorAll('label')).find((el) => el.textContent.trim().startsWith(labelText));
    if (!label) throw new Error(`No label starting with "${labelText}" found`);
    const field = label.parentElement.querySelector('input, select, textarea');
    if (!field) throw new Error(`Label "${labelText}" found but has no sibling field`);
    return field;
};

const openCreateForm = async (user) => {
    await user.click(await screen.findByRole('button', { name: /New Voucher/i }));
};

const pickDeliveryCampaign = async (user) => {
    await user.click(screen.getByRole('radio', { name: 'Delivery campaign' }));
};

const deliveryCampaignVoucher = (overrides = {}) => ({
    voucher_id: 501,
    version: 1,
    status: 'active',
    derived_status: 'active',
    code: 'FREEDEL500',
    title: 'Free delivery over 500',
    subtitle: null,
    badge: null,
    validity_text: null,
    voucher_kind: 'delivery_campaign',
    benefit_class: 'free_delivery',
    benefit_target: 'delivery',
    delivery_amount_off_centavos: null,
    auto_apply: true,
    percent_off_bps: null,
    amount_off_centavos: null,
    fixed_unit_price_centavos: null,
    pricelist_id: null,
    max_discount_centavos: null,
    min_spend_centavos: 50000,
    min_quantity: null,
    allow_below_cost: false,
    stackable_with_statutory: false,
    is_publicly_listed: false,
    valid_from: null,
    valid_until: null,
    valid_time_start: null,
    valid_time_end: null,
    weekday_mask: 127,
    channels_mask: 1,
    fulfillment_methods_mask: 1,
    order_timings_mask: 3,
    max_redemptions: null,
    max_total_discount_centavos: null,
    max_benefit_quantity: null,
    redeemed_count: 4,
    redeemed_value_centavos: 20000,
    redeemed_quantity: 0,
    ...overrides
});

describe('VoucherManagementPanel delivery-campaign authoring (#1334, Phase 245)', () => {
    beforeEach(() => {
        listVouchers.mockResolvedValue(emptyList);
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('picking "Delivery campaign" hides the item-benefit fields and shows the delivery fields', async () => {
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);
        await openCreateForm(user);

        // promo_code (default) still shows the raw benefit-class picker.
        expect(screen.getByText('Benefit type', { selector: 'label' })).toBeTruthy();

        await pickDeliveryCampaign(user);

        expect(screen.queryByText('Benefit type', { selector: 'label' })).toBeNull();
        expect(screen.queryByText(/Fixed-price vouchers apply only to the items\/folders/i)).toBeNull();
        expect(screen.getByText('Waiver amount', { exact: false })).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: /Apply automatically/i })).toBeTruthy();
        // R3: fulfillment locked to delivery-only -- Pickup is never offered for a delivery campaign.
        expect(screen.queryByRole('checkbox', { name: 'Pickup' })).toBeNull();
    });

    it('creates an auto-applied delivery campaign with the exact expected payload', async () => {
        createVoucher.mockResolvedValueOnce({ voucher: deliveryCampaignVoucher() });
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);
        await openCreateForm(user);
        await pickDeliveryCampaign(user);

        await user.type(getFieldByLabel('Campaign name'), 'Free delivery over 500');
        await user.type(getFieldByLabel('Code'), 'freedel500');
        await user.click(screen.getByRole('checkbox', { name: /Apply automatically/i }));

        await user.click(screen.getByRole('button', { name: /Create voucher/i }));

        await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1));
        expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({
            code: 'FREEDEL500',
            title: 'Free delivery over 500',
            voucher_kind: 'delivery_campaign',
            benefit_class: 'free_delivery',
            benefit_target: 'delivery',
            delivery_amount_off_centavos: null,
            auto_apply: true,
            channels_mask: 1,
            fulfillment_methods_mask: 1,
            max_benefit_quantity: null,
            scopes: [],
            is_publicly_listed: false
        }));
    });

    it('the Type filter sets voucher_kind and include_stats on the list request', async () => {
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);
        await waitFor(() => expect(listVouchers).toHaveBeenCalledTimes(1));

        await user.selectOptions(getFieldByLabel('Type'), 'delivery_campaign');

        await waitFor(() => expect(listVouchers).toHaveBeenCalledWith(expect.objectContaining({
            voucher_kind: 'delivery_campaign',
            include_stats: true
        })));
    });

    it('renders campaign performance from redemption_stats, never surfacing cache_in_sync', async () => {
        listVouchers.mockResolvedValue({
            vouchers: [deliveryCampaignVoucher()],
            pagination: { page: 1, limit: 20, total: 1, total_pages: 1 }
        });
        getVoucher.mockResolvedValueOnce({
            voucher: deliveryCampaignVoucher(),
            scopes: [],
            redemption_stats: {
                redemption_count: 4,
                total_discount_centavos: 20000,
                total_benefit_quantity: 0,
                last_redeemed_at: '2026-08-01T00:00:00.000Z',
                cached: { redeemed_count: 5, redeemed_value_centavos: 25000, redeemed_quantity: 0 },
                cache_in_sync: false
            }
        });
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);

        await user.click(await screen.findByRole('button', { name: /Edit/i }));

        expect(await screen.findByText(/Campaign performance/i)).toBeTruthy();
        expect(screen.getByText('4')).toBeTruthy();
        expect(screen.getByText('₱200.00')).toBeTruthy();
        expect(screen.queryByText(/cache_in_sync/i)).toBeNull();
        expect(screen.queryByText(/out of sync/i)).toBeNull();
    });

    it('prefers the server message for VOUCHER_BENEFIT_CONFIG_INVALID over the generic reason-code copy', async () => {
        createVoucher.mockRejectedValueOnce({
            response: {
                data: {
                    message: 'auto_apply vouchers must target the delivery fee (benefit_target: "delivery").',
                    errors: { reason_code: 'VOUCHER_BENEFIT_CONFIG_INVALID' }
                }
            }
        });
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);
        await openCreateForm(user);
        await pickDeliveryCampaign(user);

        await user.type(getFieldByLabel('Campaign name'), 'Free delivery over 500');
        await user.type(getFieldByLabel('Code'), 'FREEDEL500');
        await user.click(screen.getByRole('button', { name: /Create voucher/i }));

        expect(await screen.findByText('auto_apply vouchers must target the delivery fee (benefit_target: "delivery").')).toBeTruthy();
        expect(screen.queryByText('The discount amount for the selected benefit type is missing or invalid.')).toBeNull();
    });

    it('renders a field-level 422 against delivery_amount_off_centavos', async () => {
        createVoucher.mockRejectedValueOnce({
            response: {
                data: {
                    message: 'Please fix the highlighted fields.',
                    errors: [{ field: 'delivery_amount_off_centavos', message: 'Enter an amount greater than 0.' }]
                }
            }
        });
        const user = userEvent.setup();
        render(<VoucherManagementPanel canManage sectionId="vouchers" />);
        await openCreateForm(user);
        await pickDeliveryCampaign(user);

        await user.type(getFieldByLabel('Campaign name'), 'Free delivery over 500');
        await user.type(getFieldByLabel('Code'), 'FREEDEL500');
        await user.click(screen.getByRole('radio', { name: 'Waive up to a set amount' }));
        await user.type(getFieldByLabel('Waive up to (₱)'), '50');
        await user.click(screen.getByRole('button', { name: /Create voucher/i }));

        expect(await screen.findByText('Enter an amount greater than 0.')).toBeTruthy();
    });
});
