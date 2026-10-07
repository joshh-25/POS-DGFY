/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosOperationsDefaultsSection from '../../../../packages/web-core/src/features/pos/settings/PosOperationsDefaultsSection.jsx';
import {
  readCustomerDisplayEnabled,
  writeCustomerDisplayEnabled
} from '../../../../packages/web-core/src/features/pos/utils/customerDisplayPreference.js';

const buildProps = (overrides = {}) => ({
  loading: false,
  savingTab: '',
  posForm: {
    inventoryLowStockDisplayThreshold: 5,
    pettyCashAmount: 0,
    pettyCashSymbol: 'PHP',
    posOpenStatus: true,
    posWaitTimeMinutes: 15
  },
  locations: [],
  incomingOrders: [],
  queueLocationScopeId: null,
  onlineOrderSoundEnabled: true,
  setOnlineOrderSoundEnabled: vi.fn(),
  locked: false,
  saveDefaults: vi.fn().mockResolvedValue(true),
  customerDisplayEnabled: true,
  customerDisplayCanOpen: true,
  customerDisplayStatus: 'closed',
  customerDisplayStatusLabel: 'Not connected',
  onCustomerDisplayEnabledChange: vi.fn(),
  onOpenCustomerDisplay: vi.fn(),
  onEndCustomerDisplay: vi.fn(),
  ...overrides
});

afterEach(() => {
  cleanup();
});

describe('customer display POS Setup controls', () => {
  it('keeps activation and session actions in POS Setup', () => {
    const props = buildProps();
    render(<PosOperationsDefaultsSection {...props} />);

    expect(screen.getByTestId('pos-customer-display-settings')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Customer display activation' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('switch', { name: 'Customer display activation' }));
    fireEvent.click(screen.getByTestId('pos-open-customer-display-from-settings'));

    expect(props.onCustomerDisplayEnabledChange).toHaveBeenCalledWith(false);
    expect(props.onOpenCustomerDisplay).toHaveBeenCalledTimes(1);
  });

  it('only enables End display for an active or disconnected session', () => {
    const props = buildProps({
      customerDisplayStatus: 'connected',
      customerDisplayStatusLabel: 'Customer display connected'
    });
    render(<PosOperationsDefaultsSection {...props} />);

    const endButton = screen.getByTestId('pos-end-customer-display-from-settings');
    expect(endButton.disabled).toBe(false);
    fireEvent.click(endButton);
    expect(props.onEndCustomerDisplay).toHaveBeenCalledTimes(1);
  });

    it('disables End display after the customer window is closed', () => {
        render(<PosOperationsDefaultsSection {...buildProps({
            customerDisplayStatus: 'ended',
            customerDisplayStatusLabel: 'Customer display ended'
        })} />);

        expect(screen.getByTestId('pos-end-customer-display-from-settings').disabled).toBe(true);
        expect(screen.getByTestId('pos-open-customer-display-from-settings').disabled).toBe(false);
    });
});

describe('customer display terminal preference', () => {
  it('stores activation independently for each terminal', () => {
    const storage = new Map();
    const storageAdapter = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    };

    expect(readCustomerDisplayEnabled('john-01', { storage: storageAdapter })).toBe(true);
    expect(writeCustomerDisplayEnabled('john-01', false, { storage: storageAdapter })).toBe(true);
    expect(readCustomerDisplayEnabled('JOHN-01', { storage: storageAdapter })).toBe(false);
    expect(readCustomerDisplayEnabled('john-02', { storage: storageAdapter })).toBe(true);
  });
});
