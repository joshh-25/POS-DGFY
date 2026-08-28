// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosCheckoutDetailsSlot } from '../components/PosCheckoutDetailsSlot.jsx';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';
import { resolvePosPresentationBundle } from '../utils/posPresentationBundle.js';

afterEach(() => {
  cleanup();
});

const renderSlot = async (workflowMode, effectiveCapabilities = null) => {
  const posWorkflow = resolvePosWorkflow(workflowMode, effectiveCapabilities);
  const presentationBundle = resolvePosPresentationBundle(posWorkflow);
  const setValue = vi.fn();

  render(
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
  );

  return { posWorkflow, presentationBundle };
};

describe('PosCheckoutDetailsSlot', () => {
  it('renders only the F&B checkout-detail presentation for full-service F&B', async () => {
    await renderSlot('fnb');

    expect(await screen.findByTestId('fnb-workflow-panel')).toBeDefined();
    expect(screen.queryByText('Order details')).toBeNull();
    expect(screen.queryByTestId('services-workflow-panel')).toBeNull();
    expect(screen.queryByTestId('counter-workflow-panel')).toBeNull();
  });

  it('passes the payment field into the F&B details grid', async () => {
    const posWorkflow = resolvePosWorkflow('fnb');
    const presentationBundle = resolvePosPresentationBundle(posWorkflow);

    render(
      <PosCheckoutDetailsSlot
        presentationBundle={presentationBundle}
        posWorkflow={posWorkflow}
        orderMethod="dine_in"
        setOrderMethod={vi.fn()}
        tableNumber="T-4"
        setTableNumber={vi.fn()}
        kitchenNotes="No spice"
        setKitchenNotes={vi.fn()}
        paymentTypeField={(
          <label>
            Payment Type
            <select aria-label="Payment Type">
              <option value="cash">Cash</option>
            </select>
          </label>
        )}
      />
    );

    const workflowPanel = await screen.findByTestId('fnb-workflow-panel');
    expect(workflowPanel.textContent).toContain('Payment Type');
  });

  it('renders only the Services checkout-detail presentation for Services', async () => {
    await renderSlot('services');

    expect(await screen.findByTestId('services-workflow-panel')).toBeDefined();
    expect(screen.getByText('Service details')).toBeDefined();
    expect(screen.queryByTestId('fnb-workflow-panel')).toBeNull();
    expect(screen.queryByTestId('counter-workflow-panel')).toBeNull();
  });

  it('renders the Counter presentation after F&B dining capabilities are removed', async () => {
    await renderSlot('fnb', []);

    expect(await screen.findByTestId('counter-workflow-panel')).toBeDefined();
    expect(screen.queryByTestId('fnb-workflow-panel')).toBeNull();
    expect(screen.queryByTestId('services-workflow-panel')).toBeNull();
    expect(screen.queryByText('Dine In')).toBeNull();
  });

  it('falls back to the Counter panel when the bundle is missing', async () => {
    const posWorkflow = resolvePosWorkflow('retail');
    render(
      <PosCheckoutDetailsSlot
        presentationBundle={null}
        posWorkflow={posWorkflow}
        orderMethod="walk_in"
        setOrderMethod={vi.fn()}
      />
    );

    expect(await screen.findByTestId('counter-workflow-panel')).toBeDefined();
    expect(screen.queryByTestId('fnb-workflow-panel')).toBeNull();
    expect(screen.queryByTestId('services-workflow-panel')).toBeNull();
  });
});
