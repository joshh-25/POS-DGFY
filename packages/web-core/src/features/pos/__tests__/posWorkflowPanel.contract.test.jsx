// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FnbWorkflowPanel } from '../components/FnbWorkflowPanel.jsx';
import { CounterWorkflowPanel } from '../components/CounterWorkflowPanel.jsx';
import { ServicesWorkflowPanel } from '../components/ServicesWorkflowPanel.jsx';

afterEach(() => {
  cleanup();
});

describe('POS Workflow Panels Contract', () => {
  it('renders FnbWorkflowPanel with F&B fulfillment options and no Services terminology', () => {
    let method = 'dine_in';
    const setMethod = (m) => { method = m; };

    render(
      <FnbWorkflowPanel
        orderMethod={method}
        setOrderMethod={setMethod}
        tableNumber="T-10"
        kitchenNotes="No spice"
        setKitchenNotes={setMethod}
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

    expect(screen.getByTestId('fnb-workflow-panel')).toBeDefined();
    expect(screen.getByTestId('fnb-workflow-panel').getAttribute('class')).toContain('grid-cols-2');
    expect(screen.getByText('Order Method')).toBeDefined();
    expect(screen.getByText('Dine In')).toBeDefined();
    expect(screen.getByText('Takeout')).toBeDefined();
    expect(screen.getByText('Pickup')).toBeDefined();
    expect(screen.getByText('Delivery')).toBeDefined();
    expect(screen.getByText('Table # (Optional)')).toBeDefined();
    expect(screen.getByText('Order Notes (Global)')).toBeDefined();
    expect(screen.queryByText(/Use an item note for a request that applies to only one item/)).toBeNull();
    expect(screen.getByPlaceholderText('e.g. T-04')).toBeDefined();
    expect(screen.getByText('Payment Type')).toBeDefined();

    const textContent = screen.getByTestId('fnb-workflow-panel').textContent;
    expect(textContent).not.toContain('Guest Count');
    expect(textContent).not.toContain('Walk-in');
    expect(textContent).not.toContain('Appointment');
    expect(textContent).not.toContain('Provider');
    expect(textContent).not.toContain('Station');
  });

  it('renders ServicesWorkflowPanel with Services visit methods and no F&B terminology', () => {
    let visit = 'walk_in';
    const setVisit = (v) => { visit = v; };

    render(
      <ServicesWorkflowPanel
        visitType={visit}
        setVisitType={setVisit}
        clientName="John Doe"
        provider="Jane Stylist"
        resource="Chair 2"
      />
    );

    expect(screen.getByTestId('services-workflow-panel')).toBeDefined();
    expect(screen.getByText('Visit Method')).toBeDefined();
    expect(screen.getByText('Walk-in')).toBeDefined();
    expect(screen.getByText('Appointment')).toBeDefined();
    expect(screen.getByPlaceholderText('Walk-in Client')).toBeDefined();
    expect(screen.getByPlaceholderText('Any available')).toBeDefined();

    const textContent = screen.getByTestId('services-workflow-panel').textContent;
    expect(textContent).not.toContain('Dine In');
    expect(textContent).not.toContain('Takeout');
    expect(textContent).not.toContain('Table #');
    expect(textContent).not.toContain('Guest Count');
    expect(textContent).not.toContain('Kitchen Notes');
  });

  it('uses direct order-method buttons in the wide checkout presentation', () => {
    const setFnbMethod = vi.fn();
    const setCounterMethod = vi.fn();

    const { rerender } = render(
      <FnbWorkflowPanel
        orderMethod="dine_in"
        setOrderMethod={setFnbMethod}
        buttonLayout
      />
    );

    expect(screen.getByTestId('pos-checkout-order-method-buttons').getAttribute('class')).toContain('grid w-max min-w-full grid-cols-4 gap-1.5 overflow-visible sm:w-full');
    expect(screen.getByTestId('fnb-workflow-panel').textContent).toContain('Dine In');
    expect(screen.getByTestId('fnb-workflow-panel').getAttribute('class')).not.toContain('max-[360px]:grid-cols-1');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Take Out' }));
    expect(setFnbMethod).toHaveBeenCalledWith('takeout');

    rerender(
      <CounterWorkflowPanel
        orderMethod="walk_in"
        setOrderMethod={setCounterMethod}
        allowedMethods={['walk_in', 'delivery']}
        buttonLayout
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    expect(setCounterMethod).toHaveBeenCalledWith('delivery');
  });

  it('uses the full available row for takeout order notes', () => {
    render(
      <FnbWorkflowPanel
        orderMethod="takeout"
        setOrderMethod={vi.fn()}
        kitchenNotes=""
        setKitchenNotes={vi.fn()}
        isTabletViewport
      />
    );

    expect(screen.getByPlaceholderText('Applies to the whole order').closest('label').className).toContain('col-span-full');

    const desktopView = render(
      <FnbWorkflowPanel
        orderMethod="takeout"
        setOrderMethod={vi.fn()}
        kitchenNotes=""
        setKitchenNotes={vi.fn()}
        isTabletViewport={false}
      />
    );
    expect(desktopView.container.querySelector('label').className).not.toContain('col-span-full');
  });
});
