import { getStorefrontOrderConfirmationTemplate } from '../src/templates/emailTemplates.js';

const sampleOrder = {
  tracking_pin: 'SK-ABC123',
  invoice_number: 'INV-000123',
  payment_reference: 'pay_123',
  items: [{ item_name: 'Burger', quantity: 2, sale_price: 100, line_subtotal: 200 }],
  subtotal_amount: 200,
  discount_amount: 10,
  discount_label_snapshot: 'Lunch special',
  service_fee_amount: 5,
  service_fee_label_snapshot: 'Service fee',
  customer_processing_fee_amount: 3,
  customer_processing_fee_label_snapshot: 'Processing fee',
  delivery_fee: 20,
  total_amount: 218,
  payment_type: 'qrph',
  payment_status: 'partially_paid',
  amount_paid: 100,
  balance_due: 118,
  order_method: 'delivery',
  scheduled_for: '2026-01-01T00:00:00.000Z',
  delivery_address: 'Unit 4, Market Road'
};

describe('storefront order confirmation email template', () => {
  it('renders itemization, receipt totals, payment references, downpayment, and tracking link', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Main Street Cafe',
      order: sampleOrder,
      trackingUrl: 'https://shop.example.test/track?pin=SK-ABC123'
    });

    expect(html).toContain('Main Street Cafe');
    expect(html).toContain('SK-ABC123');
    expect(html).toContain('INV-000123');
    expect(html).toContain('pay_123');
    expect(html).toContain('Burger');
    expect(html).toContain('Unit price');
    expect(html).toContain('₱200.00');
    expect(html).toContain('Lunch special');
    expect(html).toContain('Service fee');
    expect(html).toContain('Processing fee');
    expect(html).toContain('₱218.00');
    expect(html).toContain('QRPh');
    expect(html).toContain('Partially Paid');
    expect(html).toContain('Downpayment paid');
    expect(html).toContain('₱100.00');
    expect(html).toContain('Balance due');
    expect(html).toContain('₱118.00');
    expect(html).toContain('Delivery address');
    expect(html).toContain('Asia/Manila');
    expect(html).toContain('href="https://shop.example.test/track?pin=SK-ABC123"');
    expect(html).toContain('Track your order');
    expect(html).toContain('not an official receipt');
  });

  it('shows delivery-fee waiver details and omits the track button when no URL is available', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: { ...sampleOrder, delivery_fee: 0, delivery_fee_waiver_label_snapshot: 'Free delivery voucher' },
      trackingUrl: null
    });

    expect(html).toContain('Delivery fee — Free delivery voucher');
    expect(html).not.toContain('Track your order');
  });

  it('shows pickup and dine-in location details without inventing pickup hours', () => {
    const pickup = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: { ...sampleOrder, order_method: 'pickup', delivery_address: null, location: { name: 'Main branch', address_line: '42 Market Road' } }
    });
    const dineIn = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: { ...sampleOrder, order_method: 'dine_in', delivery_address: null, location: { name: 'Main branch' } }
    });

    expect(pickup).toContain('Pickup location');
    expect(pickup).toContain('42 Market Road');
    expect(pickup).not.toContain('Pickup hours');
    expect(dineIn).toContain('Dine-in location');
    expect(dineIn).toContain('Main branch');
  });

  it('omits downpayment details for full-payment orders and escapes merchant/item/address content', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: '<script>store</script>',
      order: {
        ...sampleOrder,
        payment_status: 'paid',
        order_method: 'delivery',
        items: [{ item_name: '<script>item</script>', quantity: 1, sale_price: 1, line_subtotal: 1 }],
        delivery_address: '<script>address</script>'
      },
      trackingUrl: 'javascript:alert(1)'
    });

    expect(html).toContain('&lt;script&gt;store&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;item&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;address&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Downpayment paid');
    expect(html).not.toContain('Balance due');
    expect(html).not.toContain('href="javascript:');
  });
});
