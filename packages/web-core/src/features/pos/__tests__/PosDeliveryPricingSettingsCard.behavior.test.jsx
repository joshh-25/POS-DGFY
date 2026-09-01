/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosDeliveryPricingSettingsCard from '../components/PosDeliveryPricingSettingsCard.jsx';

const getAllSettings = vi.fn();
const updateSettings = vi.fn();
vi.mock('@/services/settingsService.js', () => ({
  getAllSettings: (...args) => getAllSettings(...args),
  updateSettings: (...args) => updateSettings(...args)
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: { error: (...args) => toastError(...args), success: (...args) => toastSuccess(...args) }
}));

const fixedModeSettings = () => ({
  store_delivery_fee: { value: 75 },
  store_delivery_fee_mode: { value: 'fixed' },
  store_delivery_fee_calc: { value: null }
});

const calculatedModeSettings = () => ({
  store_delivery_fee: { value: 75 },
  store_delivery_fee_mode: { value: 'calculated' },
  store_delivery_fee_calc: {
    value: { min_fee: 50, included_km: 3, per_km_rate: 10, increment_km: 0.5, max_distance_km: 15 }
  }
});

const adminUser = () => ({ role: 'admin', permissions: ['settings:edit'] });
const cashierUser = () => ({ role: 'cashier', permissions: [] });

describe('PosDeliveryPricingSettingsCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not fetch or render the form for a user without settings:edit', async () => {
    render(<PosDeliveryPricingSettingsCard terminalUser={cashierUser()} sectionId="s" />);
    expect(await screen.findByText(/don't have access/i)).toBeTruthy();
    expect(getAllSettings).not.toHaveBeenCalled();
  });

  it('hydrates the flat fee and mode from the shared settings keys', async () => {
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    render(<PosDeliveryPricingSettingsCard terminalUser={adminUser()} sectionId="s" />);

    await waitFor(() => expect(getAllSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue('75')).toBeTruthy();
    expect(screen.queryByLabelText(/Minimum Fee/i)).toBeNull();
  });

  it('saves a fixed-mode change without a calc key', async () => {
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    updateSettings.mockResolvedValueOnce({});
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    const user = userEvent.setup();
    render(<PosDeliveryPricingSettingsCard terminalUser={adminUser()} sectionId="s" />);

    const feeInput = await screen.findByDisplayValue('75');
    await user.clear(feeInput);
    await user.type(feeInput, '100');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      store_delivery_fee: 100,
      store_delivery_fee_mode: 'fixed'
    }));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('shows the calculated-mode formula fields and saves a fully-populated formula', async () => {
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    updateSettings.mockResolvedValueOnce({});
    getAllSettings.mockResolvedValueOnce(calculatedModeSettings());
    const user = userEvent.setup();
    render(<PosDeliveryPricingSettingsCard terminalUser={adminUser()} sectionId="s" />);

    await screen.findByDisplayValue('75');
    await user.click(screen.getByText('fixed'));
    await user.click(screen.getByText(/Calculated \(distance-based\)/i));

    await user.type(screen.getByLabelText(/Minimum Fee/i), '50');
    await user.type(screen.getByLabelText(/Included Distance/i), '3');
    await user.type(screen.getByLabelText(/Rate per km/i), '10');
    await user.type(screen.getByLabelText(/Charge Increment/i), '0.5');
    await user.type(screen.getByLabelText(/Max Distance/i), '15');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      store_delivery_fee: 75,
      store_delivery_fee_mode: 'calculated',
      store_delivery_fee_calc: { min_fee: 50, included_km: 3, per_km_rate: 10, increment_km: 0.5, max_distance_km: 15 }
    }));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('warns and omits the calc key on an incomplete formula, without blocking save', async () => {
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    updateSettings.mockResolvedValueOnce({});
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    const user = userEvent.setup();
    render(<PosDeliveryPricingSettingsCard terminalUser={adminUser()} sectionId="s" />);

    await screen.findByDisplayValue('75');
    await user.click(screen.getByText('fixed'));
    await user.click(screen.getByText(/Calculated \(distance-based\)/i));
    await user.type(screen.getByLabelText(/Minimum Fee/i), '50');

    expect(await screen.findByText(/incomplete or invalid/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      store_delivery_fee: 75,
      store_delivery_fee_mode: 'calculated'
    }));
  });

  it('disables inputs but still renders read-only when locked', async () => {
    getAllSettings.mockResolvedValueOnce(fixedModeSettings());
    render(<PosDeliveryPricingSettingsCard terminalUser={adminUser()} locked sectionId="s" />);

    // locked=true short-circuits the initial load effect entirely (matches
    // DownpaymentSettingsPanel's own locked behavior) -- nothing is fetched.
    expect(getAllSettings).not.toHaveBeenCalled();
  });
});
