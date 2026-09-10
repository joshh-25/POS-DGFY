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

  it('keeps the drawer action available when the terminal has no cash drawer capability', () => {
    const onOpenCashDrawer = vi.fn();

    render(
      <PosCurrentSaleActions
        presentationBundle={resolvePosPresentationBundle(resolvePosWorkflow('services'))}
        onCheckout={vi.fn()}
        onPrintOrder={vi.fn()}
        onOpenCashDrawer={onOpenCashDrawer}
        cashDrawerAvailable={false}
      />
    );

    const drawerButton = screen.getByTestId('pos-open-cash-drawer-button');
    expect(drawerButton.disabled).toBe(false);
    expect(drawerButton.getAttribute('title')).toBe('No cash drawer is configured for this terminal.');
    fireEvent.click(drawerButton);
    expect(onOpenCashDrawer).toHaveBeenCalledOnce();
  });

  it('uses the PC parked-sale grouping on tablet while keeping larger touch targets', () => {
    const presentationBundle = resolvePosPresentationBundle(resolvePosWorkflow('retail'));

    render(
      <PosCurrentSaleActions
        presentationBundle={presentationBundle}
        onCheckout={vi.fn()}
        onPrintOrder={vi.fn()}
        onOpenCashDrawer={vi.fn()}
        onParkSale={vi.fn()}
        onSplitPayment={vi.fn()}
        printerAvailable
        showParkedSaleControls
        tabletLayout
      />
    );

    const actionGrid = screen.getByTestId('pos-current-sale-actions');
    expect(actionGrid.className).toContain('grid-cols-6');
    expect(actionGrid.className).toContain('dgfy-pos-tablet-action-grid');
    expect(screen.getByRole('button', { name: 'Print Order' }).className).toContain('order-1 col-span-3');
    expect(screen.getByRole('button', { name: 'Checkout' }).className).toContain('order-2 col-span-3');
    expect(screen.getByTestId('pos-park-sale-button').className).toContain('order-3 col-span-2');
    expect(screen.getByTestId('pos-open-cash-drawer-button').className).toContain('order-3 col-span-2');
    expect(screen.getByTestId('pos-current-sale-split-payment').className).toContain('order-3 col-span-2');
    expect(screen.getByTestId('pos-open-cash-drawer-button').getAttribute('aria-label')).toBe('Open Cash Drawer');
    expect(screen.getByText('Open Cash Drawer')).toBeDefined();
    expect(screen.getByText('Open Cash Drawer').className).toContain('whitespace-nowrap');
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
