/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DownpaymentSettingsPanel from '../components/DownpaymentSettingsPanel.jsx';

const fetchDownpaymentSettings = vi.fn();
const updateDownpaymentSettings = vi.fn();
vi.mock('../services/downpaymentSettingsService.js', () => ({
    fetchDownpaymentSettings: (...args) => fetchDownpaymentSettings(...args),
    updateDownpaymentSettings: (...args) => updateDownpaymentSettings(...args)
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: { error: (...args) => toastError(...args), success: (...args) => toastSuccess(...args) }
}));

const fullPaymentSettings = () => ({
    tenant_id: 't-1',
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true
});

const downpaymentRequiredSettings = () => ({
    tenant_id: 't-1',
    payment_mode: 'downpayment_required',
    downpayment_type: 'percentage',
    downpayment_rate_bps: 2000,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 5000,
    downpayment_refundable: true
});

const adminUser = () => ({ role: 'admin', permissions: ['downpayment:view', 'downpayment:settings'] });
const managerUser = () => ({ role: 'manager', permissions: ['downpayment:view'] });
const cashierUser = () => ({ role: 'cashier', permissions: [] });

describe('DownpaymentSettingsPanel', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('does not render the form at all for a user without downpayment:view', async () => {
        render(<DownpaymentSettingsPanel terminalUser={cashierUser()} sectionId="s" />);
        expect(await screen.findByText(/don't have access/i)).toBeTruthy();
        expect(fetchDownpaymentSettings).not.toHaveBeenCalled();
    });

    it('loads existing settings and hides the amount fields under full_payment', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await waitFor(() => expect(fetchDownpaymentSettings).toHaveBeenCalledTimes(1));
        expect(await screen.findByText(/Full payment up front/i)).toBeTruthy();
        expect(screen.queryByLabelText(/Percentage \(%\)/i)).toBeNull();
    });

    it('hydrates a downpayment_required row and shows the seeded amount fields', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(downpaymentRequiredSettings());
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        expect(await screen.findByDisplayValue('20.00')).toBeTruthy();
        expect(screen.getByDisplayValue('50.00')).toBeTruthy();
    });

    it('blocks save client-side on an incomplete downpayment_required row and never calls the API', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        await user.click(screen.getByText(/Downpayment required/i));
        await user.click(screen.getByRole('button', { name: /save/i }));

        expect(updateDownpaymentSettings).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalled();
        expect(await screen.findByText(/downpayment_rate_bps is required/i)).toBeTruthy();
    });

    it('saves the full six-field payload on a valid downpayment_required row', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        updateDownpaymentSettings.mockResolvedValueOnce(downpaymentRequiredSettings());
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        await user.click(screen.getByText(/Downpayment required/i));
        await user.type(screen.getByLabelText(/Percentage \(%\)/i), '20');
        await user.type(screen.getByLabelText(/Minimum downpayment/i), '50');
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(updateDownpaymentSettings).toHaveBeenCalledTimes(1));
        expect(updateDownpaymentSettings).toHaveBeenCalledWith({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_bps: 2000,
            downpayment_fixed_centavos: null,
            min_downpayment_centavos: 5000,
            downpayment_refundable: true
        });
        expect(toastSuccess).toHaveBeenCalled();
    });

    it('disables Save for a view-only (manager) user and shows the amber note', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(downpaymentRequiredSettings());
        render(<DownpaymentSettingsPanel terminalUser={managerUser()} sectionId="s" />);

        await screen.findByDisplayValue('20.00');
        expect(screen.getByText(/can't change them/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /save/i }).disabled).toBe(true);
    });

    // Phase 150 (#865): the Minimum downpayment field is a no-op/silent-override trap in fixed
    // mode -- it's hidden entirely rather than shown-but-confusing.
    it('hides the Minimum downpayment field in fixed mode, shows it in percentage mode', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        await user.click(screen.getByText(/Downpayment required/i));

        // Defaults to percentage -- Minimum is visible.
        expect(await screen.findByLabelText(/Minimum downpayment/i)).toBeTruthy();

        await user.click(screen.getByText('percentage'));
        await user.click(await screen.findByText(/Fixed amount/i));

        expect(screen.queryByLabelText(/Minimum downpayment/i)).toBeNull();
    });

    // Phase 150 (#865): saving a fixed-mode row never requires (or sends a nonzero)
    // min_downpayment_centavos -- confirms the client-side gate matches the relaxed backend rule.
    it('saves a valid fixed-amount row with no minimum entered', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        updateDownpaymentSettings.mockResolvedValueOnce({ ...downpaymentRequiredSettings(), downpayment_type: 'fixed', downpayment_fixed_centavos: 50000, min_downpayment_centavos: 0 });
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        await user.click(screen.getByText(/Downpayment required/i));
        await user.click(screen.getByText('percentage'));
        await user.click(await screen.findByText(/Fixed amount/i));
        await user.type(screen.getByLabelText(/Fixed amount \(PHP\)/i), '500');
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(updateDownpaymentSettings).toHaveBeenCalledTimes(1));
        expect(updateDownpaymentSettings).toHaveBeenCalledWith({
            payment_mode: 'downpayment_required',
            downpayment_type: 'fixed',
            downpayment_rate_bps: null,
            downpayment_fixed_centavos: 50000,
            min_downpayment_centavos: 0,
            downpayment_refundable: true
        });
        expect(toastError).not.toHaveBeenCalled();
    });

    // Phase 150 (#866): the reserved literal is now offered, and selecting it shows the same
    // amount fields as downpayment_required (customer_choice is split-configurable too).
    it('offers "Let the customer choose" and shows the amount fields when selected', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        expect(screen.getByText(/Let the customer choose/i)).toBeTruthy();
        expect(screen.queryByLabelText(/Percentage \(%\)/i)).toBeNull();

        await user.click(screen.getByText(/Let the customer choose/i));
        expect(await screen.findByLabelText(/Percentage \(%\)/i)).toBeTruthy();
    });

    it('saves customer_choice with a fully-configured percentage row', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce(fullPaymentSettings());
        updateDownpaymentSettings.mockResolvedValueOnce({ ...downpaymentRequiredSettings(), payment_mode: 'customer_choice' });
        const user = userEvent.setup();
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        await screen.findByText(/Full payment up front/i);
        await user.click(screen.getByText(/Let the customer choose/i));
        await user.type(screen.getByLabelText(/Percentage \(%\)/i), '20');
        await user.type(screen.getByLabelText(/Minimum downpayment/i), '50');
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(updateDownpaymentSettings).toHaveBeenCalledTimes(1));
        expect(updateDownpaymentSettings).toHaveBeenCalledWith({
            payment_mode: 'customer_choice',
            downpayment_type: 'percentage',
            downpayment_rate_bps: 2000,
            downpayment_fixed_centavos: null,
            min_downpayment_centavos: 5000,
            downpayment_refundable: true
        });
        expect(toastSuccess).toHaveBeenCalled();
    });

    it('hydrates a stored customer_choice row and shows the seeded amount fields', async () => {
        fetchDownpaymentSettings.mockResolvedValueOnce({ ...downpaymentRequiredSettings(), payment_mode: 'customer_choice' });
        render(<DownpaymentSettingsPanel terminalUser={adminUser()} sectionId="s" />);

        expect(await screen.findByDisplayValue('20.00')).toBeTruthy();
        expect(screen.getByDisplayValue('50.00')).toBeTruthy();
    });
});
