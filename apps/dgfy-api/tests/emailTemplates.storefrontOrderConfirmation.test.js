import { getStorefrontOrderConfirmationTemplate } from '../src/templates/emailTemplates.js';

const stagingOrder = {
  tracking_pin: 'SK-ABC123',
  invoice_number: 'INV-000123',
  payment_reference: 'pay_123',
  items: [{ item_name: 'Choco Mint', quantity: '1.000000000000', sale_price: 100, line_subtotal: 100 }],
  subtotal_amount: 100,
  discount_amount: 0,
  service_fee_amount: 0,
  service_fee_label_snapshot: 'DGFY convenience fee',
  delivery_fee: 0,
  vat_amount: 10.71,
  total_amount: 100,
  payment_type: 'cash',
  payment_status: 'paid',
  order_method: 'delivery',
  created_at: '2026-10-25T00:00:00.000Z',
  delivery_address: 'Unit 4, Market Road'
};

describe('storefront order confirmation email template', () => {
  it('uses DGFY branding and matches the persisted storefront breakdown for the staging order', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Main Street Cafe',
      order: stagingOrder,
      trackingUrl: 'https://shop.example.test/track?pin=SK-ABC123',
      logoUrl: 'https://shop.example.test/uploads/storefront-assets/logo.png',
      supportUrl: 'https://shop.example.test/contact-us'
    });

    expect(html).toContain('DGFY');
    expect(html).toContain('#1a4e8d');
    expect(html).not.toContain('SKUpervisor');
    expect(html).not.toContain('#0d9488');
    expect(html).not.toContain('#0891b2');
    expect(html).toContain('<img src="https://shop.example.test/uploads/storefront-assets/logo.png"');
    expect(html).toContain('alt="Main Street Cafe"');
    expect(html).toContain('ORDER SUMMARY');
    expect(html).toContain('Your Items');
    expect(html).toContain('Choco Mint');
    expect(html).toContain('x 1');
    expect(html).not.toContain('1.000000000000');
    expect(html).toContain('Delivery Fee');
    expect(html).toContain('VAT (included in item prices)');
    expect(html).toContain('₱10.71');
    expect(html).toContain('VAT shown above is already included in item prices and is calculated before any promo or voucher discount.');
    expect(html).toContain('₱100.00');
    expect(html).not.toContain('DGFY convenience fee');
    expect(html).not.toContain('Service fee');
    expect(html).toContain('Payment method');
    expect(html).toContain('Cash on delivery');
    expect(html).toContain('Payment status');
    expect(html).toContain('ORDER PIN');
    expect(html).toContain('SK-ABC123');
    expect(html).not.toContain('INV-000123');
    expect(html).not.toContain('pay_123');
    expect(html).not.toContain('Invoice number');
    expect(html).not.toContain('Payment reference');
    expect(html).toContain('Customer delivery address');
    expect(html).toContain('href="https://shop.example.test/track?pin=SK-ABC123"');
    expect(html).toContain('href="https://shop.example.test/contact-us"');
    expect(html).toContain('Track your order');
    expect(html).toContain("You can follow your order's progress anytime with the Track your order button.");
    expect(html).toContain('Powered by DGFY');
    expect(html).toContain('not an official receipt');
    expect(html).not.toContain('special instructions');
  });

  it('formats whole and fractional quantities and only adds unit price for fractions', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        items: [
          { item_name: 'One', quantity: '1.000000000000', sale_price: 100, line_subtotal: 100 },
          { item_name: 'Two', quantity: '2.000000000000', sale_price: 50, line_subtotal: 100 },
          { item_name: 'Fractional', quantity: '1.55', sale_price: 25, line_subtotal: 38.75 },
          { item_name: 'Decimal', quantity: '1.2', sale_price: 10, line_subtotal: 12 }
        ]
      }
    });

    expect(html).toContain('x 1');
    expect(html).toContain('x 2');
    expect(html).toContain('x 1.55 · ₱25.00 each');
    expect(html).toContain('x 1.20 · ₱10.00 each');
    expect(html).not.toContain('Unit price');
  });

  it('shows positive discounts and processing fees, omits zero rows and legacy service fees', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        discount_amount: 12.5,
        discount_label_snapshot: 'Lunch special',
        customer_processing_fee_amount: 3,
        customer_processing_fee_label_snapshot: null,
        service_fee_amount: 0,
        service_fee_label_snapshot: 'DGFY convenience fee'
      }
    });
    const zeroRowsHtml = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        discount_amount: 0,
        discount_label_snapshot: 'Should be hidden',
        customer_processing_fee_amount: 0,
        customer_processing_fee_label_snapshot: 'Also hidden'
      }
    });

    expect(html).toContain('Lunch special');
    expect(html).toContain('- ₱12.50');
    expect(html).toContain('color:#15803d');
    expect(html).toContain('Item processing fee');
    expect(html).toContain('₱3.00');
    expect(html).not.toContain('DGFY convenience fee');
    expect(zeroRowsHtml).not.toContain('Should be hidden');
    expect(zeroRowsHtml).not.toContain('Also hidden');
  });

  it('uses grouped money and omits delivery fee for pickup', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        order_method: 'pickup',
        subtotal_amount: 1250,
        total_amount: 1250,
        delivery_fee: 45,
        delivery_fee_waiver_label_snapshot: 'Free delivery voucher',
        location: { name: 'Main branch', address_line: '42 Market Road' }
      },
      trackingUrl: null
    });

    expect(html).toContain('₱1,250.00');
    expect(html).toContain('Pickup At');
    expect(html).toContain('Main branch');
    expect(html).toContain('42 Market Road');
    expect(html).not.toContain('Delivery Fee');
    expect(html).not.toContain('Free delivery voucher');
    expect(html).not.toContain('>Track your order</a>');
    expect(html).not.toContain("You can follow your order's progress anytime with the Track your order button.");
  });

  it('uses a scheduled Manila time in the summary and renders dine-in location details', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        order_method: 'dine_in',
        scheduled_for: '2026-10-25T00:00:00.000Z',
        location: { name: 'Main branch' }
      }
    });

    expect(html).toContain('Scheduled for');
    expect(html).toContain('Oct 25, 2026, 08:00 AM');
    expect(html).not.toContain('Asia/Manila');
    expect(html).not.toContain('Order time</td>');
    expect(html).toContain('Dine In At');
    expect(html).toContain('Main branch');
    expect(html).not.toContain('Delivery Fee');
  });

  it.each([
    ['delivery', 'Balance due on delivery'],
    ['pickup', 'Balance due at pickup'],
    ['dine_in', 'Balance due at dine-in']
  ])('uses the %s balance wording for partially paid orders', (orderMethod, balanceLabel) => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        order_method: orderMethod,
        payment_status: 'partially_paid',
        amount_paid: 40,
        balance_due: 60
      }
    });

    expect(html).toContain('Downpayment paid');
    expect(html).toContain(balanceLabel);
    expect(html).toContain('color:#92400e');
    expect(html).toContain('₱40.00');
    expect(html).toContain('₱60.00');
  });

  it('uses a monogram for absent or unsafe logos and safely omits unavailable links', () => {
    for (const logoUrl of [null, 'javascript:alert(1)', 'data:image/png;base64,abc']) {
      const html = getStorefrontOrderConfirmationTemplate({
        storeName: 'Cafe',
        order: stagingOrder,
        trackingUrl: null,
        logoUrl,
        supportUrl: 'javascript:alert(1)'
      });

      expect(html).toContain('>C</span>');
      expect(html).not.toContain('<img src=');
      expect(html).not.toContain('href="javascript:');
      expect(html).not.toContain('Track your order</a>');
    }
  });

  it('keeps item rows text-only when no item has an image', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: stagingOrder,
      logoUrl: 'https://shop.example.test/uploads/storefront-assets/logo.png'
    });

    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).not.toContain('width="56"');
    expect(html).toContain('Choco Mint');
  });

  it('shows aligned thumbnails and a monogram tile for mixed image availability', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        items: [
          { item_name: 'Choco Mint', quantity: 1, sale_price: 100, line_subtotal: 100, image_url: 'https://shop.example.test/uploads/storefront-catalog/tenant-a/choco/thumb.webp' },
          { item_name: 'Strawberry Shake', quantity: '1.55', sale_price: 25, line_subtotal: 38.75, image_url: null }
        ]
      },
      logoUrl: null
    });

    expect(html).toContain('<img src="https://shop.example.test/uploads/storefront-catalog/tenant-a/choco/thumb.webp" width="56" height="56" alt=""');
    expect(html).toContain('background-color:#eef4fb;color:#1a4e8d;font-size:22px;line-height:56px');
    expect(html).toContain('>S</span>');
    expect(html).toContain('x 1.55 · ₱25.00 each');
    expect(html.match(/width="56" height="56"/g)).toHaveLength(1);
  });

  it('uses a 56 by 56 thumbnail for each imaged item and escapes image URLs', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        items: [
          { item_name: 'One', quantity: 1, sale_price: 10, line_subtotal: 10, image_url: 'https://cdn.example.test/one.png?size=56&label=%3Citem%3E' },
          { item_name: 'Two', quantity: 2, sale_price: 5, line_subtotal: 10, image_url: 'https://cdn.example.test/two.png' }
        ]
      }
    });

    expect(html).toContain('src="https://cdn.example.test/one.png?size=56&amp;label=%3Citem%3E"');
    expect(html.match(/width="56" height="56" alt=""/g)).toHaveLength(2);
    expect(html).not.toContain('<item>');
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:secret@cdn.example.test/image.png'
  ])('does not render unsafe item image URL %s', (imageUrl) => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: 'Cafe',
      order: {
        ...stagingOrder,
        items: [{ item_name: 'Item', quantity: 1, sale_price: 10, line_subtotal: 10, image_url: imageUrl }]
      }
    });

    expect(html).not.toContain('<img src="javascript:');
    expect(html).not.toContain('<img src="data:');
    expect(html).not.toContain('user:secret@');
    expect(html).not.toContain('width="56"');
  });

  it('escapes store, item, and address values', () => {
    const html = getStorefrontOrderConfirmationTemplate({
      storeName: '<script>store</script>',
      order: {
        ...stagingOrder,
        items: [{ item_name: '<script>item</script>', quantity: 1, sale_price: 1, line_subtotal: 1 }],
        delivery_address: '<script>address</script>'
      },
      trackingUrl: 'javascript:alert(1)'
    });

    expect(html).toContain('&lt;script&gt;store&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;item&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;address&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
});
