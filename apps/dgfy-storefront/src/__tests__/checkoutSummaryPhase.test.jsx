/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FnbCheckoutSummaryContent } from '../modes/fnb/checkout/components/FnbCheckoutSummaryContent.jsx';
import { RetailOrderSummaryContent } from '../modes/retail/checkout/components/RetailOrderSummaryContent.jsx';
import { SimpleCheckoutMobileSummaryPanel } from '../modes/simple/checkout/components/SimpleCheckoutMobileSummaryPanel.jsx';
import { SimpleCheckoutSummaryContent } from '../modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx';

const cart = [{ item_id: 1, cart_line_id: 'line-1', name: 'Sample item', quantity: 1, price: 100 }];
const totals = { subtotal_amount: 100, delivery_fee: 0, service_fee_amount: 0, vat_amount: 0, total_amount: 100 };
const sharedProps = {
  cart,
  cartCount: 1,
  cartImageErrors: new Set(),
  isDeliveryOrder: true,
  money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
  onImageError: () => {},
  scheduleLabel: 'NOW',
  totals,
  withAssetOrigin: (value) => value,
};

afterEach(cleanup);

describe('checkout summary phase presentation', () => {
  it.each([
    ['F&B', FnbCheckoutSummaryContent, { accentColor: '#1a4e8d', accentSoft: '#aee8f4', accentTint: '#eef6fd', bodyFont: 'sans-serif', displayFont: 'sans-serif', checkoutAllowed: true, variant: 'customer' }],
    ['retail', RetailOrderSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
    ['simple/MSME', SimpleCheckoutSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
  ])('hides fulfillment and schedule during the account phase for %s', (_mode, Summary, modeProps) => {
    render(<Summary {...sharedProps} {...modeProps} showFulfillmentSummary={false} />);

    expect(screen.queryByText('Fulfillment')).toBeNull();
    expect(screen.queryByText('Schedule')).toBeNull();
    expect(screen.getByText('Items')).toBeTruthy();
  });

  it('keeps fulfillment and schedule out of the mobile account-phase summary', () => {
    render(
      <SimpleCheckoutMobileSummaryPanel
        cart={cart}
        cartCount={1}
        cartImageErrors={new Set()}
        checkoutAllowed={false}
        customerStepComplete={false}
        fulfillmentStepComplete={false}
        isDeliveryOrder
        money={sharedProps.money}
        onBackToCatalog={() => {}}
        onCheckout={() => {}}
        onImageError={() => {}}
        onStepChange={() => {}}
        orderStep={1}
        scheduleLabel="NOW"
        showFulfillmentSummary={false}
        setSummaryOpen={() => {}}
        showSummary
        totals={totals}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.queryByText('Fulfillment')).toBeNull();
    expect(screen.queryByText('Schedule')).toBeNull();
    expect(screen.getByText('Items')).toBeTruthy();
  });

  it('renders the selected receiving and timing labels together', () => {
    render(
      <SimpleCheckoutSummaryContent
        {...sharedProps}
        displayFont="sans-serif"
        bodyFont="sans-serif"
        isDeliveryOrder={false}
        scheduleLabel="SCHEDULE"
        showFulfillmentSummary
      />
    );

    expect(screen.getByText('Pickup')).toBeTruthy();
    expect(screen.getByText('SCHEDULE')).toBeTruthy();
  });

  it.each([
    ['F&B', FnbCheckoutSummaryContent, { accentColor: '#1a4e8d', accentSoft: '#aee8f4', accentTint: '#eef6fd', bodyFont: 'sans-serif', displayFont: 'sans-serif', checkoutAllowed: true, variant: 'customer' }],
    ['retail', RetailOrderSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
    ['simple/MSME', SimpleCheckoutSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
  ])('renders special instructions in the %s desktop summary when provided', (_mode, Summary, modeProps) => {
    render(<Summary {...sharedProps} {...modeProps} specialInstructions="Leave the parcel at the front desk." />);

    expect(screen.getByTestId('order-special-instructions')).toBeTruthy();
    expect(screen.getByText('Leave the parcel at the front desk.')).toBeTruthy();
  });

  it('renders special instructions in the mobile summary when provided', () => {
    render(
      <SimpleCheckoutMobileSummaryPanel
        cart={cart}
        cartCount={1}
        cartImageErrors={new Set()}
        checkoutAllowed={false}
        customerStepComplete={false}
        fulfillmentStepComplete={false}
        isDeliveryOrder
        money={sharedProps.money}
        onBackToCatalog={() => {}}
        onCheckout={() => {}}
        onImageError={() => {}}
        onStepChange={() => {}}
        orderStep={2}
        scheduleLabel="NOW"
        specialInstructions="Ring the side door bell."
        showFulfillmentSummary
        setSummaryOpen={() => {}}
        showSummary
        totals={totals}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.getByText('Ring the side door bell.')).toBeTruthy();
  });

  it.each([
    ['F&B', FnbCheckoutSummaryContent, { accentColor: '#1a4e8d', accentSoft: '#aee8f4', accentTint: '#eef6fd', bodyFont: 'sans-serif', displayFont: 'sans-serif', checkoutAllowed: true, variant: 'customer' }],
    ['retail', RetailOrderSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
    ['simple/MSME', SimpleCheckoutSummaryContent, { bodyFont: 'sans-serif', displayFont: 'sans-serif' }],
  ])('keeps VAT-inclusive amounts out of the additive fee row for %s', (_mode, Summary, modeProps) => {
    render(
      <Summary
        {...sharedProps}
        {...modeProps}
        totals={{
          subtotal_amount: 105,
          delivery_fee: 0,
          service_fee_amount: 0,
          vat_amount: 11.25,
          total_amount: 94.5
        }}
      />
    );

    expect(screen.getByText('Service Fee').parentElement.textContent).toContain('PHP 0.00');
    expect(screen.getByText('VAT (included in item prices)').parentElement.textContent).toContain('PHP 11.25');
    expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
  });

  it('keeps VAT-inclusive amounts out of the additive fee row in the mobile summary', () => {
    render(
      <SimpleCheckoutMobileSummaryPanel
        cart={cart}
        cartCount={1}
        cartImageErrors={new Set()}
        checkoutAllowed={false}
        customerStepComplete={false}
        fulfillmentStepComplete={false}
        isDeliveryOrder
        money={sharedProps.money}
        onBackToCatalog={() => {}}
        onCheckout={() => {}}
        onImageError={() => {}}
        onStepChange={() => {}}
        orderStep={2}
        scheduleLabel="NOW"
        showFulfillmentSummary
        setSummaryOpen={() => {}}
        showSummary
        totals={{
          subtotal_amount: 105,
          delivery_fee: 0,
          service_fee_amount: 0,
          vat_amount: 11.25,
          total_amount: 94.5
        }}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.getByText('Service Fee').parentElement.textContent).toContain('PHP 0.00');
    expect(screen.getByText('VAT (included in item prices)').parentElement.textContent).toContain('PHP 11.25');
    expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
  });
});
