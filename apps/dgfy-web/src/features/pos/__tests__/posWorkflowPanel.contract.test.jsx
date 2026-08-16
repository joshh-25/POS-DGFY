// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FnbWorkflowPanel } from '../components/FnbWorkflowPanel.jsx';
import { ServicesWorkflowPanel } from '../components/ServicesWorkflowPanel.jsx';

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
});
