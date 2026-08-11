// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ServiceOptionsModal } from '../components/ServiceOptionsModal.jsx';

describe('ServiceOptionsModal Contract', () => {
  beforeEach(() => {
    cleanup();
  });

  const dummyServiceItem = {
    item_id: 101,
    name: 'Full Haircut & Styling',
    default_sale_price: 350.00,
    duration_minutes: 45,
    service_detail: { addons_enabled: true }
  };

  const dummyOptionGroups = [
    {
      group_id: 1,
      name: 'Duration & Package',
      group_type: 'variation',
      max_selections: 1,
      options: [
        { option_id: 11, name: 'Standard (45 mins)', price_adjustment_centavos: 0, duration_adjustment_minutes: 0 },
        { option_id: 12, name: 'Extended (60 mins)', price_adjustment_centavos: 10000, duration_adjustment_minutes: 15 }
      ]
    },
    {
      group_id: 2,
      name: 'Add-on Treatments',
      group_type: 'addon',
      max_selections: 3,
      options: [
        { option_id: 21, name: 'Hair Conditioning', price_adjustment_centavos: 15000, duration_adjustment_minutes: 10 },
        { option_id: 22, name: 'Hot Towel Massage', price_adjustment_centavos: 5000, duration_adjustment_minutes: 5 }
      ]
    }
  ];

  it('renders modal with base price and duration when open', () => {
    render(
      <ServiceOptionsModal
        open={true}
        onOpenChange={() => {}}
        serviceItem={dummyServiceItem}
        optionGroups={dummyOptionGroups}
      />
    );

    expect(screen.getByText('Full Haircut & Styling')).toBeDefined();
    expect(screen.getByText('Duration & Package')).toBeDefined();
    expect(screen.getByText('Add-on Treatments')).toBeDefined();
    expect(screen.getByText('₱350.00')).toBeDefined();
    expect(screen.getByText('45 mins')).toBeDefined();
  });

  it('recalculates live price and duration when options are selected', () => {
    const handleConfirm = vi.fn();

    render(
      <ServiceOptionsModal
        open={true}
        onOpenChange={() => {}}
        serviceItem={dummyServiceItem}
        optionGroups={dummyOptionGroups}
        onConfirmOptions={handleConfirm}
      />
    );

    // Select Extended (60 mins) option (+100.00 pesos, +15 mins)
    const extendedOption = screen.getAllByText('Extended (60 mins)')[0];
    fireEvent.click(extendedOption);

    // Quote should update to 350 + 100 = 450, 45 + 15 = 60 mins
    expect(screen.getByText('₱450.00')).toBeDefined();
    expect(screen.getByText('60 mins')).toBeDefined();

    // Confirm addition
    const confirmButton = screen.getByText('Add Service to Sale');
    fireEvent.click(confirmButton);

    expect(handleConfirm).toHaveBeenCalledWith(expect.objectContaining({
      totalPrice: 450,
      totalDuration: 60,
      selectedOptionIds: [12]
    }));
  });

  it('keeps variations visible and hides add-ons when the service toggle is off', () => {
    render(
      <ServiceOptionsModal
        open={true}
        onOpenChange={() => {}}
        serviceItem={{ ...dummyServiceItem, service_detail: { addons_enabled: false } }}
        optionGroups={dummyOptionGroups}
      />
    );

    expect(screen.getByText('Duration & Package')).toBeDefined();
    expect(screen.queryByText('Add-on Treatments')).toBeNull();
    expect(screen.queryByText('Hair Conditioning')).toBeNull();
  });

  it('starts a fresh option session when the active service changes', () => {
    function SessionHarness() {
      const [service, setService] = useState(dummyServiceItem);
      return (
        <>
          <button type="button" onClick={() => setService({ ...dummyServiceItem, item_id: 202, name: 'Express Styling', default_sale_price: 500, duration_minutes: 30 })}>Switch service</button>
          <ServiceOptionsModal
            key={service.item_id}
            open
            onOpenChange={() => {}}
            serviceItem={service}
            optionGroups={dummyOptionGroups}
          />
        </>
      );
    }

    render(<SessionHarness />);
    fireEvent.click(screen.getByText('Extended (60 mins)'));
    expect(screen.getByText('₱450.00')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Switch service' }));
    expect(screen.getByText('Express Styling')).toBeDefined();
    expect(screen.getByText('₱500.00')).toBeDefined();
    expect(screen.getByText('30 mins')).toBeDefined();
  });
});
