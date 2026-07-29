import { calculateVatInclusiveInvoice, parseCentavos } from '../entities/invoiceMoney.js';
import { assertInvoiceIssuanceMode } from '../entities/invoicingMode.js';

const failure = (status, message) => ({ success: false, status, message });
const QA_SELLER = Object.freeze({
  legal_name: 'Sieitz Solutions OPC',
  trade_name: 'DGFY',
  is_dummy: true,
  vat_status: 'VAT',
  tin: '010-888-663-000',
  branch_code: '000',
  rdo: 'RDO 074',
  address: 'Rm. 204, BINHI-TBI Building, WVSU Campus, Magsaysay Village, Lapaz, 5000 City of Iloilo, Iloilo, Philippines',
  contact: '0927 833 5030 | contact@sieitz.com',
  logo_asset: 'sieitz-logo-v1',
  fiscal_placeholders: [
    'MISSING — ATP/OCN NOT PROVIDED',
    'MISSING — BIR PERMIT DETAILS NOT PROVIDED',
    'MISSING — APPROVED INVOICE SERIES NOT PROVIDED',
    'MISSING — CAS/EIS AUTHORITY NOT CONFIRMED'
  ]
});
const serviceSnapshot = Object.freeze({ description: 'DGFY platform fee', billing_frequency: 'one_time', quantity: 1, payment_method: 'cash' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const resolveQaDestination = (intendedRecipient) => {
  const intended = String(intendedRecipient || '').trim().toLowerCase();
  const allowlist = String(process.env.PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const mailSink = String(process.env.PLATFORM_INVOICE_QA_MAIL_SINK || '').trim();
  if (allowlist.includes(intended)) return intended;
  if (mailSink) return mailSink;
  throw new Error('QA invoice delivery requires PLATFORM_INVOICE_QA_MAIL_SINK or an allowlisted recipient.');
};
const snapshotBuyer = (buyer = {}) => ({
  legal_name: String(buyer.legal_name || '').trim().slice(0, 255),
  address: String(buyer.address || '').trim().slice(0, 500) || null,
  tin: String(buyer.tin || '').trim().slice(0, 64) || null,
  contact_email: String(buyer.contact_email || '').trim().slice(0, 255) || null
});

export const buildPlatformInvoiceUseCases = ({ repository, artifactStore, emailService, pdfRenderer }) => ({
  async list() { return { success: true, data: await repository.list() }; },
  async listEligibleApplications() { return { success: true, data: await repository.listEligibleApplications() }; },
  async createDraft({ body, actor }) {
    if (body?.billing_frequency !== 'one_time' || body?.payment_method !== 'cash') return failure(422, 'Only one-time cash invoices are supported in V1.');
    const application = await repository.findApplication(body?.registration_application_id);
    if (!application || application.provisioning_status !== 'succeeded') return failure(422, 'Invoices require an approved, provisioned company registration.');
    const calculation = calculateVatInclusiveInvoice({ grossCentavos: body?.gross_centavos, cashTenderedCentavos: 0 });
    const buyer = snapshotBuyer(body?.buyer);
    if (!buyer.legal_name) return failure(422, 'Buyer legal name is required.');
    return repository.transaction(async (transaction) => {
      try {
        const existingOriginal = await repository.findOriginalForApplication(application.id, transaction);
        if (existingOriginal) return failure(409, 'An original invoice already exists for this registration.');
        const invoice = await repository.createDraft({ registration_application_id: application.id, invoice_kind: 'original', mode: 'qa', ...calculation, seller_snapshot: QA_SELLER, buyer_snapshot: buyer, service_snapshot: serviceSnapshot, recipient_email_snapshot: application.registration_email_snapshot }, transaction);
        await repository.createEvent({ invoice_id: invoice.id, event_type: 'draft_created', actor_admin_id: actor?.id || null, details: { source_application_id: application.id } }, transaction);
        return { success: true, status: 201, data: invoice };
      } catch (error) { if (/unique/i.test(error.message)) return failure(409, 'An original invoice already exists for this registration.'); throw error; }
    });
  },
  async createReplacementDraft({ invoiceId, body, actor }) {
    return repository.transaction(async (transaction) => {
      const original = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!original) return failure(404, 'Invoice not found.');
      if (original.invoice_status !== 'fully_credited') return failure(422, 'Fully credit the original invoice before creating a replacement draft.');
      const existingReplacement = await repository.findReplacementForParent(original.id, transaction);
      if (existingReplacement) return failure(409, 'A replacement invoice already exists for this fully credited original.');
      const buyer = snapshotBuyer({ ...(original.buyer_snapshot || {}), ...(body?.buyer || {}) });
      if (!buyer.legal_name) return failure(422, 'Buyer legal name is required.');
      const calculation = calculateVatInclusiveInvoice({ grossCentavos: body?.gross_centavos, cashTenderedCentavos: 0 });
      const replacement = await repository.createDraft({ registration_application_id: original.registration_application_id, parent_invoice_id: original.id, invoice_kind: 'replacement', mode: original.mode, ...calculation, seller_snapshot: original.seller_snapshot, buyer_snapshot: buyer, service_snapshot: original.service_snapshot, recipient_email_snapshot: original.recipient_email_snapshot }, transaction);
      await repository.createEvent({ invoice_id: original.id, event_type: 'replacement_draft_created', actor_admin_id: actor?.id || null, details: { replacement_invoice_id: replacement.id } }, transaction);
      await repository.createEvent({ invoice_id: replacement.id, event_type: 'draft_created', actor_admin_id: actor?.id || null, details: { replacement_for_invoice_id: original.id } }, transaction);
      return { success: true, status: 201, data: replacement };
    });
  },
  async updateDraft({ invoiceId, body, actor }) {
    return repository.transaction(async (transaction) => {
      const invoice = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!invoice) return failure(404, 'Invoice not found.');
      if (invoice.invoice_status !== 'draft') return failure(422, 'Issued invoices cannot be edited. Use the correction flow.');
      const buyer = snapshotBuyer({ ...(invoice.buyer_snapshot || {}), ...(body?.buyer || {}) });
      if (!buyer.legal_name) return failure(422, 'Buyer legal name is required.');
      const calculation = calculateVatInclusiveInvoice({ grossCentavos: body?.gross_centavos, cashTenderedCentavos: 0 });
      await invoice.update({ ...calculation, buyer_snapshot: buyer }, { transaction });
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'draft_updated', actor_admin_id: actor?.id || null }, transaction);
      return { success: true, data: invoice };
    });
  },
  async discardDraft({ invoiceId, actor }) {
    return repository.transaction(async (transaction) => {
      const invoice = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!invoice) return failure(404, 'Invoice not found.');
      if (invoice.invoice_status !== 'draft') return failure(422, 'Only an unissued draft can be discarded.');
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'draft_discarded', actor_admin_id: actor?.id || null }, transaction);
      await repository.destroyDraft(invoice, transaction);
      return { success: true, data: { id: invoiceId, discarded: true } };
    });
  },
  async issue({ invoiceId, body, actor }) {
    let storedArtifact = null;
    try {
      return await repository.transaction(async (transaction) => {
      const invoice = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!invoice) return failure(404, 'Invoice not found.');
      if (invoice.invoice_status !== 'draft') return failure(422, 'Only a draft invoice may be issued.');
      const mode = assertInvoiceIssuanceMode({ sellerProfile: invoice.seller_snapshot });
      const calculation = calculateVatInclusiveInvoice({ grossCentavos: Number(invoice.gross_centavos), cashTenderedCentavos: body?.cash_tendered_centavos, changeReturnedConfirmed: body?.change_returned_confirmed === true });
      const invoiceNumber = await repository.allocateNumber(mode.mode, transaction);
      await invoice.update({ invoice_number: invoiceNumber, invoice_status: 'issued', payment_status: calculation.payment_status, issued_at: new Date() }, { transaction });
      const payment = await repository.createPayment({ invoice_id: invoice.id, payment_type: 'cash', tendered_centavos: calculation.cash_tendered_centavos, amount_applied_centavos: calculation.amount_applied_centavos, change_due_centavos: calculation.change_due_centavos, change_returned_confirmed_at: calculation.change_due_centavos ? new Date() : null, recorded_by_admin_id: actor?.id || null, internal_note: body?.internal_cash_note || null }, transaction);
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'issued', actor_admin_id: actor?.id || null, details: { invoice_number: invoiceNumber, amount_applied_centavos: calculation.amount_applied_centavos, balance_due_centavos: calculation.balance_due_centavos } }, transaction);
      if (!artifactStore) throw new Error('Platform invoice artifact storage is unavailable.');
      if (!pdfRenderer) throw new Error('Platform invoice PDF renderer is unavailable.');
      const rendered = await pdfRenderer({ ...invoice.get({ plain: true }), payments: [payment.get({ plain: true })] });
      storedArtifact = await artifactStore.put({ invoiceId: invoice.id, invoiceNumber, mode: invoice.mode, buffer: rendered.buffer });
      const artifact = await repository.createArtifact({ invoice_id: invoice.id, artifact_type: 'issued_pdf', ...storedArtifact, created_by_admin_id: actor?.id || null }, transaction);
      return { success: true, data: { invoice, calculation, artifact, watermark: mode.watermark || null } };
      });
    } catch (error) {
      if (storedArtifact?.storage_key) await artifactStore?.remove(storedArtifact.storage_key).catch(() => {});
      throw error;
    }
  },
  async recordCashPayment({ invoiceId, body, actor }) {
    return repository.transaction(async (transaction) => {
      const invoice = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!invoice) return failure(404, 'Invoice not found.');
      if (invoice.invoice_status !== 'issued') return failure(422, 'Cash payments can only be recorded against an issued original invoice.');
      const appliedPreviously = (invoice.payments || []).reduce((total, payment) => total + Number(payment.amount_applied_centavos || 0), 0);
      const remaining = Number(invoice.gross_centavos) - appliedPreviously;
      if (remaining <= 0) return failure(422, 'This invoice is already paid in full.');
      const tendered = parseCentavos(body?.cash_tendered_centavos, 'cashTenderedCentavos');
      if (!tendered) return failure(422, 'Cash tendered must be greater than zero.');
      const amountApplied = Math.min(tendered, remaining);
      const changeDue = Math.max(tendered - remaining, 0);
      if (changeDue > 0 && body?.change_returned_confirmed !== true) return failure(422, 'Cash change must be confirmed as returned before recording payment.');
      const payment = await repository.createPayment({ invoice_id: invoice.id, payment_type: 'cash', tendered_centavos: tendered, amount_applied_centavos: amountApplied, change_due_centavos: changeDue, change_returned_confirmed_at: changeDue ? new Date() : null, recorded_by_admin_id: actor?.id || null, internal_note: body?.internal_cash_note || null }, transaction);
      const balanceDue = remaining - amountApplied;
      await invoice.update({ payment_status: balanceDue === 0 ? 'paid' : 'partial' }, { transaction });
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'cash_payment_recorded', actor_admin_id: actor?.id || null, details: { payment_id: payment.id, amount_applied_centavos: amountApplied, balance_due_centavos: balanceDue } }, transaction);
      return { success: true, data: { invoice, payment, balance_due_centavos: balanceDue } };
    });
  },
  async creditInvoice({ invoiceId, body, actor }) {
    const reason = String(body?.reason || '').trim().slice(0, 500);
    if (!reason) return failure(422, 'A correction reason is required.');
    if (body?.confirmed !== true) return failure(422, 'Confirm the full credit before recording it.');
    return repository.transaction(async (transaction) => {
      const invoice = await repository.findInvoice(invoiceId, transaction, { lock: true });
      if (!invoice) return failure(404, 'Invoice not found.');
      if (invoice.invoice_status !== 'issued') return failure(422, 'Only an issued original invoice can receive a full credit.');
      const adjustment = await repository.createAdjustment({ invoice_id: invoice.id, adjustment_type: 'full_credit', reason, amount_centavos: Number(invoice.gross_centavos), confirmed_at: new Date(), created_by_admin_id: actor?.id || null }, transaction);
      await invoice.update({ invoice_status: 'fully_credited' }, { transaction });
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'full_credit_recorded', actor_admin_id: actor?.id || null, details: { adjustment_id: adjustment.id, amount_centavos: Number(invoice.gross_centavos), reason } }, transaction);
      return { success: true, data: { invoice, adjustment } };
    });
  },
  async getArtifact({ invoiceId }) {
    const invoice = await repository.findInvoice(invoiceId);
    if (!invoice) return failure(404, 'Invoice not found.');
    const artifact = (invoice.artifacts || []).find((entry) => entry.artifact_type === 'issued_pdf');
    if (!artifact) return failure(404, 'The issued invoice PDF is not available.');
    if (!artifactStore) throw new Error('Platform invoice artifact storage is unavailable.');
    return { success: true, data: { artifact, buffer: await artifactStore.read(artifact) } };
  },
  async deliverEmail({ invoiceId, actor }) {
    const invoice = await repository.findInvoice(invoiceId);
    if (!invoice) return failure(404, 'Invoice not found.');
    if (invoice.invoice_status !== 'issued') return failure(422, 'Only an issued original invoice can be delivered.');
    const artifact = (invoice.artifacts || []).find((entry) => entry.artifact_type === 'issued_pdf');
    if (!artifact) return failure(422, 'Create the issued PDF before sending this invoice.');
    let actualRecipient;
    try { actualRecipient = invoice.mode === 'qa' ? resolveQaDestination(invoice.recipient_email_snapshot) : invoice.recipient_email_snapshot; }
    catch (error) { return failure(422, error.message); }
    const latest = await repository.findLatestDelivery(invoice.id);
    if (latest?.retry_after && new Date(latest.retry_after) > new Date()) return { ...failure(429, 'Please wait before requesting another invoice email.'), retry_after: latest.retry_after };
    const delivery = await repository.transaction(async (transaction) => {
      const created = await repository.createDelivery({ invoice_id: invoice.id, artifact_id: artifact.id, recipient_email_snapshot: invoice.recipient_email_snapshot, actual_recipient_email_snapshot: actualRecipient, requested_by_admin_id: actor?.id || null, retry_after: new Date(Date.now() + 30_000) }, transaction);
      await repository.createEvent({ invoice_id: invoice.id, event_type: 'email_delivery_queued', actor_admin_id: actor?.id || null, details: { delivery_id: created.id, intended_recipient: invoice.recipient_email_snapshot, actual_recipient: actualRecipient } }, transaction);
      return created;
    });
    try {
      if (!artifactStore || !emailService) throw new Error('Invoice email delivery is unavailable.');
      const buffer = await artifactStore.read(artifact);
      const qaNotice = invoice.mode === 'qa' ? '<p>TEST DOCUMENT — NOT VALID AS A VAT INVOICE OR FOR INPUT TAX.</p>' : '';
      const result = await emailService.sendEmail({ to: delivery.actual_recipient_email_snapshot, subject: `DGFY ${invoice.invoice_number} invoice`, html: `<p><strong>Sieitz Solutions OPC</strong> (DGFY) has attached invoice <strong>${escapeHtml(invoice.invoice_number)}</strong>.</p>${qaNotice}`, text: `Sieitz Solutions OPC (DGFY) invoice ${invoice.invoice_number} is attached.${invoice.mode === 'qa' ? ' TEST DOCUMENT — NOT VALID AS A VAT INVOICE OR FOR INPUT TAX.' : ''}`, attachments: [{ filename: artifact.filename, content: buffer, contentType: artifact.content_type }] });
      await repository.transaction((transaction) => repository.updateDelivery(delivery, { status: 'sent_to_provider', provider: result.provider || 'smtp', provider_message_id: result.messageId || null, sent_at: new Date(), retry_after: new Date(Date.now() + 30_000) }, transaction));
      await repository.transaction((transaction) => repository.createEvent({ invoice_id: invoice.id, event_type: 'email_sent_to_provider', actor_admin_id: actor?.id || null, details: { delivery_id: delivery.id, provider: result.provider || 'smtp' } }, transaction));
      return { success: true, data: { delivery } };
    } catch (error) {
      await repository.transaction((transaction) => repository.updateDelivery(delivery, { status: 'failed', last_error_summary: String(error.message || 'Invoice email delivery failed.').slice(0, 500), retry_after: new Date(Date.now() + 30_000) }, transaction));
      await repository.transaction((transaction) => repository.createEvent({ invoice_id: invoice.id, event_type: 'email_delivery_failed', actor_admin_id: actor?.id || null, details: { delivery_id: delivery.id } }, transaction));
      return failure(502, 'The invoice email could not be sent. It can be retried after the cooldown.');
    }
  }
});
