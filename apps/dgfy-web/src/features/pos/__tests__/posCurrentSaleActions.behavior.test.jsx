// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosCurrentSaleActions } from '../components/PosCurrentSaleActions.jsx';
import { resolvePosPresentationBundle } from '../utils/posPresentationBundle.js';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';

afterEach(() => {
  cleanup();
});

const renderActions = (workflowMode, effectiveCapabilities = null) => {
  const presentationBundle = resolvePosPresentationBundle(
    resolvePosWorkflow(workflowMode, effectiveCapabilities)
  );
  const actions = {
    onOpenParkedSales: vi.fn(),
    onParkAndNewSale: vi.fn(),
    onCheckout: vi.fn(),
    onPrintOrder: vi.fn(),
    onOpenCashDrawer: vi.fn(),
    onApplyDiscount: vi.fn()
  };

  render(
    <PosCurrentSaleActions
      presentationBundle={presentationBundle}
      {...actions}
      itemCount={2}
      printerAvailable
    />
  );

  return { actions, presentationBundle };
};

describe('PosCurrentSaleActions', () => {
  it('shows F&B parked-sale actions together with shared cashier actions', () => {
    const { presentationBundle } = renderActions('fnb');

    expect(presentationBundle.key).toBe('fnb');
    expect(screen.getByTestId('pos-open-parked-sales-button')).toBeDefined();
    expect(screen.getByTestId('pos-park-sale-button')).toBeDefined();
    expect(screen.getByText('Checkout (2 Items)')).toBeDefined();
    expect(screen.getByText('Print Order')).toBeDefined();
    expect(screen.getByText('Open Cash Drawer')).toBeDefined();
    expect(screen.getByText('Apply Discount')).toBeDefined();
  });

  it('shows Counter parked-sale actions after F&B dining capabilities are removed', () => {
    const { presentationBundle } = renderActions('fnb', []);

    expect(presentationBundle.key).toBe('counter');
    expect(screen.getByTestId('pos-open-parked-sales-button')).toBeDefined();
    expect(screen.getByTestId('pos-park-sale-button')).toBeDefined();
  });

  it('hides unchanged order-oriented parked-sale controls in Services', () => {
    const { presentationBundle } = renderActions('services');

    expect(presentationBundle.key).toBe('services');
    expect(screen.queryByTestId('pos-open-parked-sales-button')).toBeNull();
    expect(screen.queryByTestId('pos-park-sale-button')).toBeNull();
    expect(screen.queryByText('Parked Sales')).toBeNull();
    expect(screen.queryByText('Park & New Sale')).toBeNull();
    expect(screen.getByText('Checkout (2 Items)')).toBeDefined();
    expect(screen.getByText('Print Order')).toBeDefined();
    expect(screen.getByText('Open Cash Drawer')).toBeDefined();
    expect(screen.getByText('Apply Discount')).toBeDefined();
  });

  it('keeps shared cashier action callbacks intact for Services', () => {
    const { actions } = renderActions('services');

    fireEvent.click(screen.getByText('Checkout (2 Items)'));
    fireEvent.click(screen.getByText('Print Order'));
    fireEvent.click(screen.getByText('Open Cash Drawer'));
    fireEvent.click(screen.getByText('Apply Discount'));

    expect(actions.onCheckout).toHaveBeenCalledOnce();
    expect(actions.onPrintOrder).toHaveBeenCalledOnce();
    expect(actions.onOpenCashDrawer).toHaveBeenCalledOnce();
    expect(actions.onApplyDiscount).toHaveBeenCalledOnce();
    expect(actions.onOpenParkedSales).not.toHaveBeenCalled();
    expect(actions.onParkAndNewSale).not.toHaveBeenCalled();
  });

  it('falls back to the Services-safe action set when the bundle is missing', () => {
    render(
      <PosCurrentSaleActions
        presentationBundle={null}
        onCheckout={vi.fn()}
        onPrintOrder={vi.fn()}
        onOpenCashDrawer={vi.fn()}
        onApplyDiscount={vi.fn()}
      />
    );

    expect(screen.queryByTestId('pos-open-parked-sales-button')).toBeNull();
    expect(screen.queryByTestId('pos-park-sale-button')).toBeNull();
    expect(screen.getByText('Checkout (0 Items)')).toBeDefined();
  });
});

