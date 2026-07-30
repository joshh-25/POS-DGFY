import { buildPlatformInvoiceUseCases } from '../src/modules/platformInvoicing/usecases/platformInvoiceUseCases.js';
import { calculateVatInclusiveInvoice } from '../src/modules/platformInvoicing/services/invoiceMoney.js';
import { renderPlatformInvoicePdf } from '../src/modules/platformInvoicing/services/platformInvoicePdf.js';
import { jest } from '@jest/globals';

describe('platform landlord invoice use cases', () => {
  test('calculates VAT-inclusive centavos and blocks unconfirmed cash change', () => {
    expect(calculateVatInclusiveInvoice({ grossCentavos: 11200, cashTenderedCentavos: 12000, changeReturnedConfirmed: true })).toMatchObject({
      vat_centavos: 1200,
      vatable_sales_centavos: 10000,
      change_due_centavos: 800,
      payment_status: 'paid'
    });
    expect(() => calculateVatInclusiveInvoice({ grossCentavos: 100, cashTenderedCentavos: 101 })).toThrow('Cash change must be confirmed');
  });

  test('sets the database uniqueness guard only on an original draft', async () => {
    const repository = {
      findApplication: jest.fn().mockResolvedValue({
        id: 'application-1',
        provisioning_status: 'succeeded',
        registration_email_snapshot: 'owner@example.test'
      }),
      transaction: async (callback) => callback({}),
      findOriginalForApplication: jest.fn().mockResolvedValue(null),
      createDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
      createEvent: jest.fn().mockResolvedValue()
    };

    const result = await buildPlatformInvoiceUseCases({ repository }).createDraft({
      body: {
        registration_application_id: 'application-1',
        billing_frequency: 'one_time',
        payment_method: 'cash',
        gross_centavos: 11200,
        buyer: { legal_name: 'Buyer Corp' }
      },
      actor: { id: 'admin-1' }
    });

    expect(result).toMatchObject({ success: true, status: 201 });
    expect(repository.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      registration_application_id: 'application-1',
      original_registration_application_id: 'application-1',
      invoice_kind: 'original'
    }), expect.anything());
  });

  test('appends later cash payment only to an issued original and updates remaining balance', async () => {
    const invoice = {
      id: 'invoice-1', invoice_status: 'issued', invoice_kind: 'original', payment_status: 'partial', gross_centavos: 10000,
      payments: [{ amount_applied_centavos: 4000 }], update: jest.fn().mockResolvedValue()
    };
    const repository = {
      transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
      findInvoice: jest.fn().mockResolvedValue(invoice),
      createPayment: jest.fn().mockResolvedValue({ id: 'payment-2' }), createEvent: jest.fn().mockResolvedValue()
    };
    const result = await buildPlatformInvoiceUseCases({ repository }).recordCashPayment({
      invoiceId: invoice.id,
      body: { cash_tendered_centavos: 6000 },
      actor: { id: 'admin-1' }
    });
    expect(result).toMatchObject({ success: true, data: { balance_due_centavos: 0 } });
    expect(repository.createPayment).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: invoice.id, amount_applied_centavos: 6000, payment_type: 'cash' }), expect.anything());
    expect(invoice.update).toHaveBeenCalledWith({ payment_status: 'paid' }, expect.anything());
  });

  test('rejects an over-tendered later payment until change return is confirmed', async () => {
    const invoice = { id: 'invoice-1', invoice_status: 'issued', invoice_kind: 'original', gross_centavos: 10000, payments: [{ amount_applied_centavos: 9000 }], update: jest.fn() };
    const repository = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }), findInvoice: jest.fn().mockResolvedValue(invoice), createPayment: jest.fn() };
    await expect(buildPlatformInvoiceUseCases({ repository }).recordCashPayment({ invoiceId: invoice.id, body: { cash_tendered_centavos: 2000 }, actor: { id: 'admin-1' } })).resolves.toMatchObject({ success: false, status: 422, message: expect.stringContaining('Cash change must be confirmed') });
    expect(repository.createPayment).not.toHaveBeenCalled();
  });

  test('renders a TEST-only PDF artifact with a stable SHA-256 digest', async () => {
    const rendered = await renderPlatformInvoicePdf({
      invoice_number: 'TEST-00000001', issued_at: '2026-07-28T00:00:00.000Z', gross_centavos: 11200, vat_centavos: 1200, vatable_sales_centavos: 10000,
      seller_snapshot: { legal_name: 'Sieitz Solutions OPC', trade_name: 'DGFY', vat_status: 'VAT', tin: '010-888-663-000', branch_code: '000', address: 'Test address', contact: 'test@example.test', logo_asset: 'sieitz-logo-v1', fiscal_placeholders: ['MISSING — ATP/OCN NOT PROVIDED'] }, buyer_snapshot: { legal_name: 'Buyer Corp' }, service_snapshot: { description: 'DGFY platform fee' },
      payments: [{ tendered_centavos: 11200, amount_applied_centavos: 11200, change_due_centavos: 0 }]
    });
    expect(rendered.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(rendered.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(rendered.buffer.length).toBeGreaterThan(500);
  });

  test('sends the stored issued PDF and records provider delivery', async () => {
    const previousSink = process.env.PLATFORM_INVOICE_QA_MAIL_SINK;
    process.env.PLATFORM_INVOICE_QA_MAIL_SINK = 'qa-mail-sink@example.test';
    const artifact = { id: 'artifact-1', artifact_type: 'issued_pdf', filename: 'DGFY-TEST-00000001.pdf', content_type: 'application/pdf', storage_key: 'invoice-1/test.pdf', sha256: 'a'.repeat(64) };
    const invoice = { id: 'invoice-1', invoice_status: 'issued', invoice_number: 'TEST-00000001', recipient_email_snapshot: 'owner@example.test', artifacts: [artifact] };
    const delivery = { recipient_email_snapshot: invoice.recipient_email_snapshot, actual_recipient_email_snapshot: 'qa-mail-sink@example.test', update: jest.fn().mockResolvedValue() };
    const repository = { findInvoice: jest.fn().mockResolvedValue(invoice), findLatestDelivery: jest.fn().mockResolvedValue(null), transaction: async (callback) => callback({}), createDelivery: jest.fn().mockResolvedValue(delivery), updateDelivery: jest.fn().mockResolvedValue(), createEvent: jest.fn().mockResolvedValue() };
    const artifactStore = { read: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')), remove: jest.fn() };
    const emailService = { sendEmail: jest.fn().mockResolvedValue({ provider: 'smtp', messageId: 'smtp-1' }) };
    const result = await buildPlatformInvoiceUseCases({ repository, artifactStore, emailService }).deliverEmail({ invoiceId: invoice.id, actor: { id: 'admin-1' } });
    expect(result.success).toBe(true);
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'qa-mail-sink@example.test', attachments: [expect.objectContaining({ filename: artifact.filename, content: Buffer.from('%PDF-test') })] }));
    expect(repository.updateDelivery).toHaveBeenCalledWith(delivery, expect.objectContaining({ status: 'sent_to_provider', provider: 'smtp' }), expect.anything());
    if (previousSink == null) delete process.env.PLATFORM_INVOICE_QA_MAIL_SINK;
    else process.env.PLATFORM_INVOICE_QA_MAIL_SINK = previousSink;
  });

  test('records an append-only full credit without editing the original snapshot', async () => {
    const invoice = { id: 'invoice-1', invoice_status: 'issued', invoice_kind: 'original', gross_centavos: 11200, update: jest.fn().mockResolvedValue() };
    const repository = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }), findInvoice: jest.fn().mockResolvedValue(invoice), createAdjustment: jest.fn().mockResolvedValue({ id: 'credit-1' }), createEvent: jest.fn().mockResolvedValue() };
    const result = await buildPlatformInvoiceUseCases({ repository }).creditInvoice({ invoiceId: invoice.id, actor: { id: 'admin-1' }, body: { reason: 'Duplicate charge', confirmed: true } });
    expect(result.success).toBe(true);
    expect(repository.createAdjustment).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: invoice.id, adjustment_type: 'full_credit', amount_centavos: 11200 }), expect.anything());
    expect(invoice.update).toHaveBeenCalledWith({ invoice_status: 'fully_credited' }, expect.anything());
  });

  test('creates a replacement draft only after the original is fully credited', async () => {
    const original = { id: 'invoice-original', registration_application_id: 'application-1', invoice_status: 'fully_credited', mode: 'qa', gross_centavos: 11200, seller_snapshot: { legal_name: 'Sieitz Solutions OPC' }, buyer_snapshot: { legal_name: 'Wrong Buyer' }, service_snapshot: { description: 'DGFY platform fee' }, recipient_email_snapshot: 'owner@example.test' };
    const repository = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }), findInvoice: jest.fn().mockResolvedValue(original), findReplacementForParent: jest.fn().mockResolvedValue(null), createDraft: jest.fn().mockResolvedValue({ id: 'replacement-1' }), createEvent: jest.fn().mockResolvedValue() };
    const result = await buildPlatformInvoiceUseCases({ repository }).createReplacementDraft({ invoiceId: original.id, actor: { id: 'admin-1' }, body: { gross_centavos: 22400, buyer: { legal_name: 'Correct Buyer' } } });
    expect(result).toMatchObject({ success: true, status: 201, data: { id: 'replacement-1' } });
    expect(repository.createDraft).toHaveBeenCalledWith(expect.objectContaining({ parent_invoice_id: original.id, invoice_kind: 'replacement', registration_application_id: original.registration_application_id, buyer_snapshot: expect.objectContaining({ legal_name: 'Correct Buyer' }) }), expect.anything());
    repository.findInvoice.mockResolvedValue({ ...original, invoice_status: 'issued' });
    await expect(buildPlatformInvoiceUseCases({ repository }).createReplacementDraft({ invoiceId: original.id, body: { gross_centavos: 22400, buyer: { legal_name: 'Correct Buyer' } } })).resolves.toMatchObject({ success: false, status: 422 });
    repository.findInvoice.mockResolvedValue(original); repository.findReplacementForParent.mockResolvedValue({ id: 'replacement-existing' });
    await expect(buildPlatformInvoiceUseCases({ repository }).createReplacementDraft({ invoiceId: original.id, body: { gross_centavos: 22400, buyer: { legal_name: 'Correct Buyer' } } })).resolves.toMatchObject({ success: false, status: 409 });
  });

  test('allows a draft to be amended but rejects editing an issued invoice', async () => {
    const draft = { id: 'draft-1', invoice_status: 'draft', buyer_snapshot: { legal_name: 'Buyer' }, update: jest.fn().mockResolvedValue() };
    const repository = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }), findInvoice: jest.fn().mockResolvedValue(draft), createEvent: jest.fn().mockResolvedValue() };
    const result = await buildPlatformInvoiceUseCases({ repository }).updateDraft({ invoiceId: draft.id, body: { gross_centavos: 11200, buyer: { legal_name: 'Correct Buyer' } }, actor: { id: 'admin-1' } });
    expect(result.success).toBe(true);
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ gross_centavos: 11200, buyer_snapshot: expect.objectContaining({ legal_name: 'Correct Buyer', address: null, tin: null }) }), expect.anything());
    repository.findInvoice.mockResolvedValue({ ...draft, invoice_status: 'issued' });
    await expect(buildPlatformInvoiceUseCases({ repository }).updateDraft({ invoiceId: draft.id, body: { gross_centavos: 11200, buyer: { legal_name: 'Correct Buyer' } } })).resolves.toMatchObject({ success: false, status: 422 });
  });

  test('discards a draft without deleting its append-only audit history', async () => {
    const draft = { id: 'draft-1', invoice_status: 'draft' };
    const repository = {
      transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
      findInvoice: jest.fn().mockResolvedValue(draft),
      discardDraft: jest.fn().mockResolvedValue(),
      createEvent: jest.fn().mockResolvedValue()
    };

    const result = await buildPlatformInvoiceUseCases({ repository }).discardDraft({
      invoiceId: draft.id,
      actor: { id: 'admin-1' }
    });

    expect(result).toMatchObject({ success: true, data: { id: draft.id, discarded: true } });
    expect(repository.discardDraft).toHaveBeenCalledWith(draft, expect.anything());
    expect(repository.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      invoice_id: draft.id,
      event_type: 'draft_discarded'
    }), expect.anything());
  });

  test('refuses QA invoice email when neither a safe sink nor an allowlist is configured', async () => {
    const previousSink = process.env.PLATFORM_INVOICE_QA_MAIL_SINK;
    const previousAllowlist = process.env.PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST;
    delete process.env.PLATFORM_INVOICE_QA_MAIL_SINK;
    delete process.env.PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST;
    const artifact = { id: 'artifact-1', artifact_type: 'issued_pdf', filename: 'DGFY-TEST-00000001.pdf' };
    const repository = { findInvoice: jest.fn().mockResolvedValue({ id: 'invoice-1', invoice_status: 'issued', invoice_number: 'TEST-00000001', mode: 'qa', recipient_email_snapshot: 'owner@example.test', artifacts: [artifact] }) };
    await expect(buildPlatformInvoiceUseCases({ repository }).deliverEmail({ invoiceId: 'invoice-1' })).resolves.toMatchObject({ success: false, status: 422, message: expect.stringContaining('QA invoice delivery requires') });
    if (previousSink == null) delete process.env.PLATFORM_INVOICE_QA_MAIL_SINK; else process.env.PLATFORM_INVOICE_QA_MAIL_SINK = previousSink;
    if (previousAllowlist == null) delete process.env.PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST; else process.env.PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST = previousAllowlist;
  });
});
