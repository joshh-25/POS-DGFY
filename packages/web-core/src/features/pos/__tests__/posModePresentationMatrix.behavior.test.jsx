// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosCheckoutDetailsSlot } from '../components/PosCheckoutDetailsSlot.jsx';
import { PosCurrentSaleActions } from '../components/PosCurrentSaleActions.jsx';
import { resolvePosPresentationBundle } from '../utils/posPresentationBundle.js';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';

afterEach(() => {
  cleanup();
});

const PROFILE_CASES = Object.freeze([
  Object.freeze({
    name: 'full-service F&B',
    workflowMode: 'fnb',
    effectiveCapabilities: null,
    bundleKey: 'fnb',
    detailsTestId: 'fnb-workflow-panel',
    heading: 'Order details',
    visibleLabels: ['Dine In', 'Table # (Optional)', 'Order Notes (global)'],
    hiddenLabels: ['Visit Method', 'Client Name', 'Provider / Employee', 'Resource / Room']
  }),
  Object.freeze({
    name: 'counter-service F&B',
    workflowMode: 'fnb',
    effectiveCapabilities: [],
    bundleKey: 'counter',
    detailsTestId: 'counter-workflow-panel',
    heading: 'Order details',
    visibleLabels: ['Walk-in'],
    hiddenLabels: ['Dine In', 'Table # (Optional)', 'Order Notes (global)', 'Visit Method', 'Client Name']
  }),
  Object.freeze({
    name: 'Services',
    workflowMode: 'services',
    effectiveCapabilities: null,
    bundleKey: 'services',
    detailsTestId: 'services-workflow-panel',
    heading: 'Service details',
    visibleLabels: ['Visit Method', 'Client Name', 'Provider / Employee', 'Resource / Room', 'Service Notes'],
    hiddenLabels: ['Dine In', 'Table # (Optional)', 'Order Notes (global)', 'Parked Sales', 'Park & New Sale']
  }),
  Object.freeze({
    name: 'generic Counter',
    workflowMode: 'retail',
    effectiveCapabilities: null,
    bundleKey: 'counter',
    detailsTestId: 'counter-workflow-panel',
    heading: 'Order details',
    visibleLabels: ['Walk-in'],
    hiddenLabels: ['Dine In', 'Table # (Optional)', 'Order Notes (global)', 'Visit Method', 'Client Name']
  })
]);

const renderProfile = ({ workflowMode, effectiveCapabilities }) => {
  const posWorkflow = resolvePosWorkflow(workflowMode, effectiveCapabilities);
  const presentationBundle = resolvePosPresentationBundle(posWorkflow);
  const setValue = vi.fn();
  const actions = {
    onCheckout: vi.fn(),
    onPrintOrder: vi.fn(),
    onOpenCashDrawer: vi.fn(),
    onSplitPayment: vi.fn()
  };

  render(
    <main>
      <PosCheckoutDetailsSlot
        presentationBundle={presentationBundle}
        posWorkflow={posWorkflow}
        orderMethod={posWorkflow.allowedMethods[0]}
        setOrderMethod={setValue}
        tableNumber="T-4"
        setTableNumber={setValue}
        kitchenNotes="No spice"
        setKitchenNotes={setValue}
        servicesClientName="Ana"
        setServicesClientName={setValue}
        servicesDateTime="2026-08-14T09:00"
        setServicesDateTime={setValue}
        servicesProvider="Mia"
        setServicesProvider={setValue}
        servicesResource="Chair 2"
        setServicesResource={setValue}
        servicesNotes="First visit"
        setServicesNotes={setValue}
      />
      <PosCurrentSaleActions
        {...actions}
        itemCount={2}
        printerAvailable
      />
    </main>
  );

  return { actions, presentationBundle };
};

describe('POS mode presentation matrix', () => {
  PROFILE_CASES.forEach((profile) => {
    it(`renders only the governed ${profile.name} presentation`, async () => {
      const { actions, presentationBundle } = renderProfile(profile);

      expect(presentationBundle.key).toBe(profile.bundleKey);
      expect(await screen.findByTestId(profile.detailsTestId, {}, { timeout: 5000 })).toBeDefined();
      expect(screen.getByText(profile.heading)).toBeDefined();

      profile.visibleLabels.forEach((label) => {
        expect(screen.getByText(label)).toBeDefined();
      });
      profile.hiddenLabels.forEach((label) => {
        expect(screen.queryByText(label)).toBeNull();
      });

      fireEvent.click(screen.getByText('Checkout'));
      fireEvent.click(screen.getByText('Print Order'));
      fireEvent.click(screen.getByText('Open Cash Drawer'));
      fireEvent.click(screen.getByText('Split Payment'));

      expect(actions.onCheckout).toHaveBeenCalledOnce();
      expect(actions.onPrintOrder).toHaveBeenCalledOnce();
      expect(actions.onOpenCashDrawer).toHaveBeenCalledOnce();
      expect(actions.onSplitPayment).toHaveBeenCalledOnce();
    });
  });

  it('keeps the Services action grid touch-safe at narrow and short viewports', () => {
    const { presentationBundle } = renderProfile(PROFILE_CASES[2]);
    const actionGrid = screen.getByTestId('pos-current-sale-actions');

    expect(presentationBundle.key).toBe('services');
    expect(actionGrid.getAttribute('data-has-parked-sale-controls')).toBe('false');
    expect(actionGrid.className).toContain('grid-cols-2');
    expect(actionGrid.className).toContain('sm:grid-cols-2');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    screen.getAllByRole('button').forEach((button) => {
      expect(button.className).toContain('min-h-[46px]');
    });
  });

  it('does not leak an F&B render into a later Services render', async () => {
    renderProfile(PROFILE_CASES[0]);
    expect(await screen.findByTestId('fnb-workflow-panel', {}, { timeout: 5000 })).toBeDefined();
    cleanup();

    renderProfile(PROFILE_CASES[2]);
    expect(await screen.findByTestId('services-workflow-panel', {}, { timeout: 5000 })).toBeDefined();
    expect(screen.queryByTestId('fnb-workflow-panel')).toBeNull();
    expect(screen.queryByText('Order Notes (global)')).toBeNull();
    expect(screen.queryByText('Parked Sales')).toBeNull();
  });
});
