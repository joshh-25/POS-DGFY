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
    onCheckout: vi.fn(),
    onPrintOrder: vi.fn(),
    onOpenCashDrawer: vi.fn(),
    onParkSale: vi.fn()
  };

  render(
    <PosCurrentSaleActions
      {...actions}
      itemCount={2}
      printerAvailable
      showParkedSaleControls={presentationBundle.currentSaleActions.showParkedSaleControls}
    />
  );

  return { actions, presentationBundle };
};

describe('PosCurrentSaleActions', () => {
  it('shows the explicit park action separately from the header history action in F&B', () => {
    const { actions, presentationBundle } = renderActions('fnb');

    expect(presentationBundle.key).toBe('fnb');
    const parkButton = screen.getByTestId('pos-park-sale-button');
    expect(parkButton).toBeDefined();
    expect(screen.getByText('Checkout')).toBeDefined();
    expect(screen.getByText('Print Order')).toBeDefined();
    expect(screen.getByText('Open Cash Drawer')).toBeDefined();
    expect(screen.queryByText('Apply Discount')).toBeNull();
    fireEvent.click(parkButton);
    expect(actions.onParkSale).toHaveBeenCalledOnce();
  });

  it('keeps the parked action for Counter mode after F&B dining capabilities are removed', () => {
    const { presentationBundle } = renderActions('fnb', []);

    expect(presentationBundle.key).toBe('counter');
    expect(screen.getByTestId('pos-park-sale-button')).toBeDefined();
  });

  it('hides unchanged order-oriented parked-sale controls in Services', () => {
    const { presentationBundle } = renderActions('services');

    expect(presentationBundle.key).toBe('services');
    expect(screen.queryByTestId('pos-park-sale-button')).toBeNull();
    expect(screen.queryByText('Parked Sales')).toBeNull();
    expect(screen.queryByText('Park & New Sale')).toBeNull();
    expect(screen.getByText('Checkout')).toBeDefined();
    expect(screen.getByText('Print Order')).toBeDefined();
    expect(screen.getByText('Open Cash Drawer')).toBeDefined();
    expect(screen.queryByText('Apply Discount')).toBeNull();
  });

  it('keeps shared cashier action callbacks intact for Services', () => {
    const { actions } = renderActions('services');

    fireEvent.click(screen.getByText('Checkout'));
    fireEvent.click(screen.getByText('Print Order'));
    fireEvent.click(screen.getByText('Open Cash Drawer'));

    expect(actions.onCheckout).toHaveBeenCalledOnce();
    expect(actions.onPrintOrder).toHaveBeenCalledOnce();
    expect(actions.onPrintOrder).toHaveBeenCalledWith();
    expect(actions.onOpenCashDrawer).toHaveBeenCalledOnce();
  });

  it('falls back to the Services-safe action set when the bundle is missing', () => {
    render(
      <PosCurrentSaleActions
        presentationBundle={null}
        onCheckout={vi.fn()}
        onOpenCashDrawer={vi.fn()}
        showParkedSaleControls={false}
      />
    );

    expect(screen.queryByTestId('pos-open-parked-sales-button')).toBeNull();
    expect(screen.queryByTestId('pos-park-sale-button')).toBeNull();
    expect(screen.getByText('Checkout')).toBeDefined();
  });
});
